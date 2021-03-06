const Command = require('../command');
const Models = require('../../../models/index');
const Utilities = require('../../Utilities');
const constants = require('../../constants');

/**
 * Creates offer on blockchain
 */
class DCOfferCreateBcCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.logger = ctx.logger;
        this.blockchain = ctx.blockchain;
        this.remoteControl = ctx.remoteControl;
        this.replicationService = ctx.replicationService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            internalOfferId,
            dataSetId,
            dataRootHash,
            redLitigationHash,
            greenLitigationHash,
            blueLitigationHash,
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            dataSizeInBytes,
            litigationIntervalInMinutes,
            urgent,
        } = command.data;

        let result;

        try {
            result = await this.blockchain.createOffer(
                Utilities.normalizeHex(this.config.erc725Identity),
                dataSetId,
                dataRootHash,
                redLitigationHash,
                greenLitigationHash,
                blueLitigationHash,
                Utilities.normalizeHex(this.config.identity),
                holdingTimeInMinutes,
                tokenAmountPerHolder,
                dataSizeInBytes,
                litigationIntervalInMinutes,
                urgent,
            );
        } catch (error) {
            if (error.message.includes('Gas price higher than maximum allowed price')) {
                this.logger.info('Gas price too high, delaying call for 30 minutes');
                return Command.repeat();
            }
            throw error;
        }
        this.logger.important(`Offer with internal ID ${internalOfferId} for data set ${dataSetId} written to blockchain. Waiting for DHs...`);

        const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
        offer.transaction_hash = result.transactionHash;
        offer.status = 'PUBLISHED';
        offer.message = 'Offer has been published to Blockchain';
        await offer.save({ fields: ['status', 'message', 'transaction_hash'] });
        this.remoteControl.offerUpdate({
            id: internalOfferId,
        });

        await this.blockchain.executePlugin('fingerprint-plugin', {
            dataSetId,
            dataRootHash,
        });

        const { data } = command;
        return this.continueSequence(this.pack(data), command.sequence);
    }

    /**
     * Recover system from failure
     * @param command
     * @param err
     */
    async recover(command, err) {
        const { internalOfferId, handler_id } = command.data;
        const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
        offer.status = 'FAILED';
        offer.global_status = 'FAILED';
        offer.message = err.message;
        await offer.save({ fields: ['status', 'message', 'global_status'] });
        this.remoteControl.offerUpdate({
            id: internalOfferId,
        });
        Models.handler_ids.update({
            status: 'FAILED',
        }, { where: { handler_id } });
        await this.replicationService.cleanup(offer.id);
        return Command.empty();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dcOfferCreateBcCommand',
            delay: 0,
            period: constants.GAS_PRICE_VALIDITY_TIME_IN_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DCOfferCreateBcCommand;
