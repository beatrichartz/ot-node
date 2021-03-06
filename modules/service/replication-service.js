const BN = require('bn.js');
const path = require('path');
const fs = require('fs');

const Encryption = require('../RSAEncryption');
const ImportUtilities = require('../ImportUtilities');
const Models = require('../../models/index');
const Utilities = require('../Utilities');
const OtJsonUtilities = require('../OtJsonUtilities');

/**
 * Supported versions of the same data set
 * @type {{RED: string, BLUE: string, GREEN: string}}
 */
const COLOR = {
    RED: 'red',
    BLUE: 'blue',
    GREEN: 'green',
};

class ReplicationService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.graphStorage = ctx.graphStorage;
        this.challengeService = ctx.challengeService;
        this.importService = ctx.importService;
        this.permissionedDataService = ctx.permissionedDataService;
        const replicationPath = path.join(this.config.appDataPath, 'replication_cache');

        if (!fs.existsSync(replicationPath)) {
            fs.mkdirSync(replicationPath);
        }
    }

    /**
     * Creates replications for one Offer
     * @param internalOfferId   - Internal Offer ID
     * @returns {Promise<void>}
     */
    async createReplications(internalOfferId) {
        const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
        if (!offer) {
            throw new Error(`Failed to find offer with internal ID ${internalOfferId}`);
        }

        const otJson = await this.importService.getImport(offer.data_set_id);

        await this.permissionedDataService.addDataSellerForPermissionedData(
            offer.data_set_id,
            this.config.erc725Identity,
            this.config.default_data_price,
            this.config.identity,
            otJson['@graph'],
        );

        ImportUtilities.removeGraphPermissionedData(otJson['@graph']);

        const hashes = {};

        const writeFilePromises = [];

        for (let i = 0; i < 3; i += 1) {
            const color = this.castNumberToColor(i);

            const litigationKeyPair = Encryption.generateKeyPair(2048);
            const distributionKeyPair = Encryption.generateKeyPair(512);

            // TODO Optimize encryption to reduce memory usage
            let encryptedDataset =
                ImportUtilities.encryptDataset(otJson, distributionKeyPair.privateKey);

            const distRootHash = ImportUtilities.calculateDatasetRootHash(encryptedDataset);

            encryptedDataset = ImportUtilities.encryptDataset(otJson, litigationKeyPair.privateKey);

            let sortedDataset =
                OtJsonUtilities.prepareDatasetForGeneratingLitigationProof(encryptedDataset);
            if (!sortedDataset) {
                sortedDataset = encryptedDataset;
            }
            const litRootHash = this.challengeService.getLitigationRootHash(sortedDataset['@graph']);

            const distEpk = Encryption.packEPK(distributionKeyPair.publicKey);
            // const litigationEpk = Encryption.packEPK(distributionKeyPair.publicKey);
            // TODO Why are there zeroes here
            const distributionEpkChecksum =
                Encryption.calculateDataChecksum(distEpk, 0, 0, 0);

            const replication = {
                color,
                otJson: encryptedDataset,
                litigationPublicKey: litigationKeyPair.publicKey,
                litigationPrivateKey: litigationKeyPair.privateKey,
                distributionPublicKey: distributionKeyPair.publicKey,
                distributionPrivateKey: distributionKeyPair.privateKey,
                distributionEpkChecksum,
                litigationRootHash: litRootHash,
                distributionRootHash: distRootHash,
                distributionEpk: distEpk,
            };

            writeFilePromises.push(this.saveReplication(internalOfferId, color, replication));

            hashes[`${color}LitigationHash`] = litRootHash;
            hashes[`${color}DistributionHash`] = distRootHash;
        }

        await Promise.all(writeFilePromises);

        return hashes;
    }

    /**
     * Casts color to number
     * @param color
     */
    castColorToNumber(color) {
        switch (color.toLowerCase()) {
        case COLOR.RED:
            return new BN(0, 10);
        case COLOR.GREEN:
            return new BN(1, 10);
        case COLOR.BLUE:
            return new BN(2, 10);
        default:
            throw new Error(`Failed to cast color ${color}`);
        }
    }

    /**
     * Cast number to color
     * @param colorNumber: allowed numbers:
     * 0 - RED
     * 1 - GREEN
     * 2 - BLUE
     * @returns {string}
     */
    castNumberToColor(colorNumber) {
        switch (colorNumber) {
        case 0:
            return COLOR.RED;
        case 1:
            return COLOR.GREEN;
        case 2:
            return COLOR.BLUE;
        default:
            throw new Error(`Failed to cast number to color ${colorNumber}, allowed number 0, 1, 2`);
        }
    }

    /**
     * Replications cleanup (delete dir, purge cache)
     * @param internalOfferId
     * @return {Promise<void>}
     */
    async cleanup(internalOfferId) {
        this.logger.info(`Deleting replications directory and cache for offer with internal ID ${internalOfferId}`);
        const offerDirPath = this._getOfferDirPath(internalOfferId);
        await Utilities.deleteDirectory(offerDirPath);
    }

    /**
     * Save single replication
     * @param color
     * @param data
     * @param internalOfferId
     */
    async saveReplication(internalOfferId, color, data) {
        const offerDirPath = this._getOfferDirPath(internalOfferId);
        await Utilities.writeContentsToFile(offerDirPath, `${color}.json`, JSON.stringify(data));
    }

    /**
     * Load replication from cache or file
     * @param internalOfferId
     * @param color
     * @return {Promise<*>}
     */
    async loadReplication(internalOfferId, color) {
        const offerDirPath = this._getOfferDirPath(internalOfferId);
        const colorFilePath = path.join(offerDirPath, `${color}.json`);

        const data = JSON.parse(await Utilities.fileContents(colorFilePath));
        this.logger.trace(`Loaded replication from file for offer internal ID ${internalOfferId} and color ${color}`);

        return data;
    }

    /**
     * Gets offer directory
     * @param internalOfferId
     * @returns {string}
     */
    _getOfferDirPath(internalOfferId) {
        return path.join(
            this.config.appDataPath,
            this.config.dataSetStorage, internalOfferId,
        );
    }
}

module.exports = ReplicationService;
