const fs = require('fs');
const path = require('path');

const Models = require('../../../models/index');
const Command = require('../command');
const ImportUtilities = require('../../ImportUtilities');
const Utilities = require('../../Utilities');
const OtJsonUtilities = require('../../OtJsonUtilities');

/**
 * Handles data read response for free.
 */
class DVDataReadResponseFreeCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.blockchain = ctx.blockchain;
        this.remoteControl = ctx.remoteControl;
        this.commandExecutor = ctx.commandExecutor;
        this.permissionedDataService = ctx.permissionedDataService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     * @param transaction
     */
    async execute(command, transaction) {
        const {
            message,
        } = command.data;


        /*
            message: {
                id: REPLY_ID
                wallet: DH_WALLET,
                data_provider_wallet: DC_WALLET,
                nodeId: KAD_ID
                agreementStatus: CONFIRMED/REJECTED,
                data: { … }
                importId: IMPORT_ID,        // Temporal. Remove it.
            },
         */

        // Is it the chosen one?
        const replyId = message.id;
        const {
            data_set_id: dataSetId,
            data_provider_wallet: dcWallet,
            wallet: dhWallet,
            transaction_hash,
            handler_id,
        } = message;

        // Find the particular reply.
        const networkQueryResponse = await Models.network_query_responses.findOne({
            where: { reply_id: replyId },
        });

        if (!networkQueryResponse) {
            throw Error(`Didn't find query reply with ID ${replyId}.`);
        }

        const networkQuery = await Models.network_queries.findOne({
            where: { id: networkQueryResponse.query_id },
        });

        if (message.agreementStatus !== 'CONFIRMED') {
            networkQuery.status = 'REJECTED';
            await networkQuery.save({ fields: ['status'] });
            throw Error('Read not confirmed');
        }

        const { document, permissionedData } = message;
        // Calculate root hash and check is it the same on the SC.
        const fingerprint = await this.blockchain.getRootHash(dataSetId);

        if (!fingerprint || Utilities.isZeroHash(fingerprint)) {
            const errorMessage = `Couldn't not find fingerprint for Dc ${dcWallet} and import ID ${dataSetId}`;
            this.logger.warn(errorMessage);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            throw errorMessage;
        }

        const rootHash = ImportUtilities.calculateDatasetRootHash(document);

        if (fingerprint !== rootHash) {
            const errorMessage = `Fingerprint root hash doesn't match with one from data. Root hash ${rootHash}, first DH ${dhWallet}, import ID ${dataSetId}`;
            this.logger.warn(errorMessage);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            throw errorMessage;
        }

        this.permissionedDataService.attachPermissionedDataToGraph(
            document['@graph'],
            permissionedData,
        );

        const erc725Identity = document.datasetHeader.dataCreator.identifiers[0].identifierValue;
        const profile = await this.blockchain.getProfile(erc725Identity);

        await this.permissionedDataService.addDataSellerForPermissionedData(
            dataSetId,
            erc725Identity,
            0,
            profile.nodeId.toLowerCase().slice(0, 42),
            document['@graph'],
        );

        const handler = await Models.handler_ids.findOne({
            where: { handler_id },
        });
        const {
            data_set_id,
            standard_id,
            readExport,
        } = JSON.parse(handler.data);

        if (readExport) {
            let sortedDataset = OtJsonUtilities.prepareDatasetForDataRead(document);
            if (!sortedDataset) {
                sortedDataset = document;
            }
            const cacheDirectory = path.join(this.config.appDataPath, 'export_cache');

            try {
                await Utilities.writeContentsToFile(
                    cacheDirectory,
                    handler_id,
                    JSON.stringify(sortedDataset),
                );
            } catch (e) {
                const filePath = path.join(cacheDirectory, handler_id);

                if (fs.existsSync(filePath)) {
                    await Utilities.deleteDirectory(filePath);
                }
                this.handleError(handler_id, `Error when creating export cache file for handler_id ${handler_id}. ${e.message}`);
            }

            const handler = await Models.handler_ids.findOne({
                where: { handler_id },
            });

            const data = JSON.parse(handler.data);
            data.transaction_hash = transaction_hash;
            data.data_creator = document.datasetHeader.dataCreator;
            data.signature = document.signature;
            data.root_hash = rootHash;
            handler.data = JSON.stringify(data);

            await Models.handler_ids.update(
                { data: handler.data },
                {
                    where: {
                        handler_id,
                    },
                },
            );

            await this.commandExecutor.add({
                name: 'exportWorkerCommand',
                transactional: false,
                data: {
                    handlerId: handler.handler_id,
                    datasetId: data_set_id,
                    standardId: standard_id,
                },
            });
        }

        try {
            const cacheDirectory = path.join(this.config.appDataPath, 'import_cache');

            await Utilities.writeContentsToFile(
                cacheDirectory,
                handler_id,
                JSON.stringify(document),
            );

            const commandData = {
                documentPath: path.join(cacheDirectory, handler_id),
                handler_id,
                data_provider_wallet: dcWallet,
                purchased: true,
            };

            const commandSequence = [
                'dcConvertToGraphCommand',
                'dcWriteImportToGraphDbCommand',
                'dcFinalizeImportCommand',
            ];

            await this.commandExecutor.add({
                name: commandSequence[0],
                sequence: commandSequence.slice(1),
                delay: 0,
                data: commandData,
                transactional: false,
            });
        } catch (error) {
            this.logger.warn(`Failed to import JSON. ${error}.`);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            return Command.empty();
        }

        // Store holding information and generate keys for eventual data replication.
        await Models.purchased_data.create({
            data_set_id: dataSetId,
            transaction_hash,
        });

        this.logger.info(`Data set ID ${dataSetId} import started.`);
        this.logger.trace(`DataSet ${dataSetId} purchased for query ID ${networkQueryResponse.query_id}, ` +
            `reply ID ${replyId}.`);
        this.remoteControl.readNotification({
            dataSetId,
            queryId: networkQueryResponse.query_id,
            replyId: networkQueryResponse.reply_id,
        });

        return Command.empty();
    }

    async handleError(handlerId, error) {
        this.logger.error(`Export failed for export handler_id: ${handlerId}, error: ${error}`);

        const handler = await Models.handler_ids.findOne({
            where: { handler_id: handlerId },
        });

        const data = JSON.parse(handler.data);
        data.export_status = 'FAILED';
        handler.status = data.import_status === 'PENDING' ? 'PENDING' : 'FAILED';
        handler.data = JSON.stringify(data);

        await Models.handler_ids.update(
            handler,
            {
                where: {
                    handler_id: handlerId,
                },
            },
        );
    }

    /**
     * Builds default DVDataReadResponseFreeCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dvDataReadResponseFreeCommand',
            delay: 0,
            deadline_at: Date.now() + (5 * 60 * 1000),
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DVDataReadResponseFreeCommand;
