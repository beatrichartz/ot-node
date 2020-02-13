const uuidv4 = require('uuid/v4');
const Models = require('../../models');
const Utilities = require('../Utilities');
const ImportUtilities = require('../ImportUtilities');
const constants = require('../constants');
/**
 * Encapsulates DV related methods
 */
class DVController {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.commandExecutor = ctx.commandExecutor;
        this.remoteControl = ctx.remoteControl;
        this.transport = ctx.transport;
        this.config = ctx.config;
        this.web3 = ctx.web3;
        this.graphStorage = ctx.graphStorage;
    }

    /**
     * Sends query to the network.
     * @param query Query
     * @returns {Promise<*>}
     */
    async queryNetwork(query, response) {
        this.logger.info(`Query handling triggered with ${JSON.stringify(query)}.`);

        const queryId = uuidv4();

        try {
            await this.commandExecutor.add({
                name: 'dvQueryNetworkCommand',
                delay: 0,
                data: {
                    queryId,
                    query,
                },
                transactional: false,
            });
        } catch (error) {
            this.logger.error(`Failed query network. ${error}.`);
            response.status(400);
            response.send({
                message: error.message,
            });
            return;
        }

        return queryId;
    }

    async handleNetworkQueryStatus(id, response) {
        this.logger.info(`Query of network status triggered with ID ${id}`);
        try {
            const networkQuery = await Models.network_queries.find({ where: { id } });
            response.status(200);
            response.send({
                status: networkQuery.status,
                query_id: networkQuery.id,
            });
        } catch (error) {
            console.log(error);
            response.status(400);
            response.send({
                error: `Fail to process network query status for ID ${id}.`,
            });
        }
    }

    async getNetworkQueryResponses(query_id, response) {
        this.logger.info(`Query for network response triggered with query ID ${query_id}`);

        let responses = await Models.network_query_responses.findAll({
            where: {
                query_id,
            },
        });

        responses = responses.map(response => ({
            datasets: JSON.parse(response.data_set_ids),
            stake_factor: response.stake_factor,
            reply_id: response.reply_id,
            node_id: response.node_id,
        }));

        response.status(200);
        response.send(responses);
    }

    /**
     * Handles data read request
     * @param data_set_id - Dataset to be read
     * @param reply_id - Id of DH reply previously sent to user
     * @param res - API result object
     * @returns null
     */
    async handleDataReadRequest(data_set_id, reply_id, res) {
        this.logger.info(`Choose offer triggered with reply ID ${reply_id} and import ID ${data_set_id}`);

        const offer = await Models.network_query_responses.findOne({
            where: {
                reply_id,
            },
        });

        if (offer == null) {
            res.status(400);
            res.send({ message: 'Reply not found' });
            return;
        }
        try {
            const dataInfo = await Models.data_info.findOne({
                where: { data_set_id },
            });

            let isPrivateData = false;
            for (const element of JSON.parse(offer.data_set_ids)) {
                if (element.data_set_id === data_set_id && element.private_data) {
                    isPrivateData = true;
                    break;
                }
            }

            if (dataInfo && !isPrivateData) {
                const message = `I've already stored data for data set ID ${data_set_id}.`;
                this.logger.trace(message);
                res.status(200);
                res.send({ message });
                return;
            }
            const handler_data = {
                data_set_id,
                reply_id,
            };
            const inserted_object = await Models.handler_ids.create({
                status: 'PENDING',
                data: JSON.stringify(handler_data),
            });
            const handlerId = inserted_object.dataValues.handler_id;
            this.logger.info(`Read offer for query ${offer.query_id} with handler id ${handlerId} initiated.`);
            this.remoteControl.offerInitiated(`Read offer for query ${offer.query_id} with handler id ${handlerId} initiated.`);

            res.status(200);
            res.send({
                handler_id: handlerId,
            });

            this.commandExecutor.add({
                name: 'dvDataReadRequestCommand',
                delay: 0,
                data: {
                    readOnlyPrivateData: dataInfo && isPrivateData,
                    dataSetId: data_set_id,
                    replyId: reply_id,
                    handlerId,
                    nodeId: offer.node_id,
                },
                transactional: false,
            });
        } catch (e) {
            const message = `Failed to handle offer ${offer.id} for query ${offer.query_id} handled. ${e}.`;
            res.status(400);
            res.send({ message });
        }
    }

    _validatePrivateData(data) {
        let validated = false;
        constants.PRIVATE_DATA_OBJECT_NAMES.forEach((private_data_array) => {
            if (data[private_data_array] && Array.isArray(data[private_data_array])) {
                data[private_data_array].forEach((private_object) => {
                    if (private_object.isPrivate && private_object.data) {
                        const calculatedPrivateHash = ImportUtilities
                            .calculatePrivateDataHash(private_object);
                        validated = calculatedPrivateHash === private_object.private_data_hash;
                    }
                });
            }
        });
        return validated;
    }

    async handlePrivateDataReadResponse(message) {
        const {
            handler_id, ot_objects,
        } = message;
        const documentsToBeUpdated = [];
        ot_objects.forEach((otObject) => {
            otObject.relatedObjects.forEach((relatedObject) => {
                if (relatedObject.vertex.vertexType === 'Data') {
                    if (this._validatePrivateData(relatedObject.vertex.data)) {
                        documentsToBeUpdated.push(relatedObject.vertex);
                    }
                }
            });
        });
        const promises = [];
        documentsToBeUpdated.forEach((document) => {
            promises.push(this.graphStorage.updateDocument('ot_vertices', document));
        });
        await Promise.all(promises);
        await Models.handler_ids.update({
            status: 'SUCCESSFULL',
        }, { where: { handler_id } });
    }

    async sendNetworkPurchase(dataSetId, nodeId, otJsonObjectId, handlerId) {
        const message = {
            data_set_id: dataSetId,
            handler_id: handlerId,
            ot_json_object_id: otJsonObjectId,
            wallet: this.config.node_wallet,
        };
        const dataPurchaseRequestObject = {
            message,
            messageSignature: Utilities.generateRsvSignature(
                JSON.stringify(message),
                this.web3,
                this.config.node_private_key,
            ),
        };

        await this.transport.sendDataPurchaseRequest(
            dataPurchaseRequestObject,
            nodeId,
        );
    }

    async handleNetworkPurchaseResponse(response) {
        const { handler_id, status, message } = response;

        await Models.handler_ids.update({
            data: JSON.stringify({ message }),
            status,
        }, {
            where: {
                handler_id,
            },
        });
    }

    async handleDataLocationResponse(message) {
        const queryId = message.id;

        // Find the query.
        const networkQuery = await Models.network_queries.findOne({
            where: { id: queryId },
        });

        if (!networkQuery) {
            throw Error(`Didn't find query with ID ${queryId}.`);
        }

        if (networkQuery.status !== 'OPEN') {
            throw Error('Too late. Query closed.');
        }

        await this.commandExecutor.add({
            name: 'dvDataLocationResponseCommand',
            delay: 0,
            data: {
                queryId,
                wallet: message.wallet,
                nodeId: message.nodeId,
                imports: message.imports,
                dataPrice: message.dataPrice,
                dataSize: message.dataSize,
                stakeFactor: message.stakeFactor,
                replyId: message.replyId,
            },
            transactional: false,
        });
    }

    async handleDataReadResponseFree(message) {
        // Is it the chosen one?
        const replyId = message.id;

        // Find the particular reply.
        const networkQueryResponse = await Models.network_query_responses.findOne({
            where: { reply_id: replyId },
        });

        if (!networkQueryResponse) {
            throw Error(`Didn't find query reply with ID ${replyId}.`);
        }
        await this.commandExecutor.add({
            name: 'dvDataReadResponseFreeCommand',
            delay: 0,
            data: {
                message,
            },
            transactional: false,
        });
    }
}

module.exports = DVController;

