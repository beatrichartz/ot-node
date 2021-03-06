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
        this.blockchain = ctx.blockchain;
        this.emitter = ctx.emitter;

        this.transport = ctx.transport;
        this.config = ctx.config;
        this.web3 = ctx.web3;
        this.graphStorage = ctx.graphStorage;

        this.mapping_standards_for_event = new Map();
        this.mapping_standards_for_event.set('OT-JSON', 'ot-json');
        this.mapping_standards_for_event.set('GS1-EPCIS', 'gs1');
        this.mapping_standards_for_event.set('GRAPH', 'ot-json');
        this.mapping_standards_for_event.set('WOT', 'wot');
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

            if (dataInfo) {
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

    // /**
    //  * Handles private data read request
    //  * @param data_set_id - Dataset that holdsprivate data
    //  * @param ot_object_id - Object id that holds private data
    //  * @param seller_node_id - Node id that holds private data
    //  * @param res - API result object
    //  * @returns null
    //  */
    // async handlePermissionedDataReadRequest(data_set_id, ot_object_id,seller_node_id,response) {
    //     const handler_data = {
    //         data_set_id,
    //         ot_object_id,
    //         seller_node_id,
    //     };
    //     const inserted_object = await Models.handler_ids.create({
    //         status: 'PENDING',
    //         data: JSON.stringify(handler_data),
    //     });
    //     const handlerId = inserted_object.dataValues.handler_id;
    //     this.logger.info(`Read private data with id
    //     ${ot_object_id} with handler id ${handlerId} initiated.`);
    //
    //     response.status(200);
    //     response.send({
    //         handler_id: handlerId,
    //     });
    //
    //     this.commandExecutor.add({
    //         name: 'dvPermissionedDataReadRequestCommand',
    //         delay: 0,
    //         data: {
    //             data_set_id,
    //             ot_object_id,
    //             seller_node_id,
    //             handlerId,
    //         },
    //         transactional: false,
    //     });
    // }

    // _validatePermissionedData(data) {
    //     let validated = false;
    //     constants.PRIVATE_DATA_OBJECT_NAMES.forEach((private_data_array) => {
    //         if (data[private_data_array] && Array.isArray(data[private_data_array])) {
    //             data[private_data_array].forEach((private_object) => {
    //                 if (private_object.isPrivate && private_object.data) {
    //                     const calculatedPrivateHash = ImportUtilities
    //                         .calculatePermissionedDataHash(private_object);
    //                 validated = calculatedPrivateHash ===private_object.permissioned_data_hash;
    //                 }
    //             });
    //         }
    //     });
    //     return validated;
    // }
    //
    // async handlePermissionedDataReadResponse(message) {
    //     const {
    //         handler_id, ot_objects,
    //     } = message;
    //     const documentsToBeUpdated = [];
    //     ot_objects.forEach((otObject) => {
    //         otObject.relatedObjects.forEach((relatedObject) => {
    //             if (relatedObject.vertex.vertexType === 'Data') {
    //                 if (this._validatePermissionedData(relatedObject.vertex.data)) {
    //                     documentsToBeUpdated.push(relatedObject.vertex);
    //                 }
    //             }
    //         });
    //     });
    //     const promises = [];
    //     documentsToBeUpdated.forEach((document) => {
    //         promises.push(this.graphStorage.updateDocument('ot_vertices', document));
    //     });
    //     await Promise.all(promises);
    //
    //     const handlerData = await Models.handler_ids.findOne({
    //         where: {
    //             handler_id,
    //         },
    //     });
    //
    //     const { data_set_id, ot_object_id } = JSON.parse(handlerData.data);
    //
    //     await Models.data_sellers.create({
    //         data_set_id,
    //         ot_json_object_id: ot_object_id,
    //         seller_node_id: this.config.identity.toLowerCase(),
    //         seller_erc_id: Utilities.normalizeHex(this.config.erc725Identity),
    //         price: this.config.default_data_price,
    //     });
    //
    //
    //     await Models.handler_ids.update({
    //         status: 'COMPLETED',
    //     }, { where: { handler_id } });
    // }

    // async sendNetworkPurchase(dataSetId, erc725Identity, nodeId, otJsonObjectId, handlerId) {
    //     const message = {
    //         data_set_id: dataSetId,
    //         dv_erc725_identity: erc725Identity,
    //         handler_id: handlerId,
    //         ot_json_object_id: otJsonObjectId,
    //         wallet: this.config.node_wallet,
    //     };
    //     const dataPurchaseRequestObject = {
    //         message,
    //         messageSignature: Utilities.generateRsvSignature(
    //             JSON.stringify(message),
    //             this.web3,
    //             this.config.node_private_key,
    //         ),
    //     };
    //     await this.transport.sendDataPurchaseRequest(
    //         dataPurchaseRequestObject,
    //         nodeId,
    //     );
    // }

    async sendNetworkPurchase(request, response) {
        if (request.body == null
            || request.body.data_set_id == null
            || request.body.seller_node_id == null
            || request.body.ot_object_id == null) {
            response.status(400);
            response.send({ message: 'Params data_set_id, seller_node_id and ot_object_id are required.' });
            return;
        }
        const {
            data_set_id, seller_node_id, ot_object_id,
        } = request.body;
        const inserted_object = await Models.handler_ids.create({
            data: JSON.stringify({
                data_set_id, seller_node_id, ot_object_id,
            }),
            status: 'REQUESTED',
        });
        const { handler_id } = inserted_object.dataValues;
        response.status(200);
        response.send({
            handler_id,
        });

        const commandData = {
            data_set_id,
            handler_id,
            ot_object_id,
            seller_node_id,
        };

        await this.commandExecutor.add({
            name: 'dvPurchaseRequestCommand',
            data: commandData,
        });
    }

    async sendPermissionedDataPriceRequest(dataSetId, nodeId, otJsonObjectId, handlerId) {
        const message = {
            data_set_id: dataSetId,
            handler_id: handlerId,
            ot_json_object_id: otJsonObjectId,
            wallet: this.config.node_wallet,
        };
        const dataPriceRequestObject = {
            message,
            messageSignature: Utilities.generateRsvSignature(
                JSON.stringify(message),
                this.web3,
                this.config.node_private_key,
            ),
        };

        await this.transport.sendPermissionedDataPriceRequest(
            dataPriceRequestObject,
            nodeId,
        );
    }
    // async handleNetworkPurchaseResponse(response) {
    //     const {
    //         handler_id, status, message, seller_node_id, seller_erc_id, price,
    //     } = response;
    //
    //     const handlerData = await Models.handler_ids.findOne({
    //         where: {
    //             handler_id,
    //         },
    //     });
    //
    //     const { data_set_id, ot_object_id } = JSON.parse(handlerData.data);
    //
    //     await Models.data_trades.create({
    //         data_set_id,
    //         ot_json_object_id: ot_object_id,
    //         buyer_node_id: this.config.identity,
    //         buyer_erc_id: this.config.erc725Identity.toLowerCase(),
    //         seller_node_id,
    //         seller_erc_id,
    //         price,
    //         purchase_id: '',
    //         status,
    //     });
    //
    //     await Models.handler_ids.update({
    //         data: JSON.stringify({ message }),
    //         status,
    //     }, {
    //         where: {
    //             handler_id,
    //         },
    //     });
    // }


    async handleNetworkPurchaseResponse(response) {
        const {
            handler_id, status, message, encoded_data,
            permissioned_data_root_hash, encoded_data_root_hash,
            permissioned_data_array_length, permissioned_data_original_length,
        } = response;

        const commandData = {
            handler_id,
            status,
            message,
            encoded_data,
            permissioned_data_root_hash,
            encoded_data_root_hash,
            permissioned_data_array_length,
            permissioned_data_original_length,
        };

        await this.commandExecutor.add({
            name: 'dvPurchaseInitiateCommand',
            data: commandData,
        });
    }

    async handlePermissionedDataPriceResponse(response) {
        const {
            handler_id, status, price_in_trac,
        } = response;

        const handler = await Models.handler_ids.findOne({
            where: {
                handler_id,
            },
        });

        const {
            data_set_id,
            seller_node_id,
            ot_object_id,
        } = JSON.parse(handler.data);

        if (status === 'COMPLETED') {
            await Models.data_sellers.update({
                price: price_in_trac,
            }, {
                where: {
                    data_set_id,
                    seller_node_id,
                    ot_json_object_id: ot_object_id,
                },
            });
        }

        await Models.handler_ids.update({
            data: JSON.stringify({
                message: {
                    data_set_id,
                    seller_node_id,
                    ot_object_id,
                    price_in_trac,
                },
            }),
            status,
        }, {
            where: {
                handler_id,
            },
        });
    }


    /**
     * Handles data read request
     * @param queryId
     * @param dataSetId
     * @param replyId
     */
    async handleDataReadExportRequest(req, res) {
        this.logger.api('POST: Network read and export request received.');

        if (req.body == null || req.body.reply_id == null
            || req.body.data_set_id == null) {
            res.status(400);
            res.send({ message: 'Params reply_id, data_set_id are required.' });
            return;
        }
        const { reply_id, data_set_id } = req.body;
        let standard_id =
            this.mapping_standards_for_event.get(req.body.standard_id);
        if (!standard_id) {
            standard_id = 'ot-json';
        }
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
            const handler_data = {
                data_set_id,
                reply_id,
                standard_id,
                export_status: 'PENDING',
                import_status: 'PENDING',
                readExport: true,
            };
            const inserted_object = await Models.handler_ids.create({
                status: 'PENDING',
                data: JSON.stringify(handler_data),
            });

            const dataInfo = await Models.data_info.findOne({
                where: { data_set_id },
            });
            if (dataInfo) {
                handler_data.import_status = 'COMPLETED';
                await Models.handler_ids.update(
                    {
                        data: JSON.stringify(handler_data),
                    },
                    {
                        where: {
                            handler_id: inserted_object.handler_id,
                        },
                    },
                );

                const commandSequence = [
                    'exportDataCommand',
                    'exportWorkerCommand',
                ];

                await this.commandExecutor.add({
                    name: commandSequence[0],
                    sequence: commandSequence.slice(1),
                    delay: 0,
                    data: {
                        handlerId: inserted_object.handler_id,
                        datasetId: data_set_id,
                        standardId: standard_id,
                    },
                    transactional: false,
                });
            } else {
                this.logger.info(`Read offer for query ${offer.query_id} with handler id ${inserted_object.dataValues.handler_id} initiated.`);
                this.remoteControl.offerInitiated(`Read offer for query ${offer.query_id} with handler id ${inserted_object.dataValues.handler_id} initiated.`);


                this.commandExecutor.add({
                    name: 'dvDataReadRequestCommand',
                    delay: 0,
                    data: {
                        dataSetId: data_set_id,
                        replyId: reply_id,
                        handlerId: inserted_object.dataValues.handler_id,
                        nodeId: offer.node_id,
                    },
                    transactional: false,
                });
            }

            res.status(200);
            res.send({
                handler_id: inserted_object.dataValues.handler_id,
            });
        } catch (e) {
            const message = `Failed to handle offer ${offer.id} for query ${offer.query_id} handled. ${e}.`;
            res.status(400);
            res.send({ message });
        }
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
            this.logger.info('Too late. Query closed.');
        } else {
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

    handleGetFingerprint(req, res) {
        this.logger.api('GET: Fingerprint request received.');
        const { dataset_id } = req.params;
        if (dataset_id == null) {
            res.status(400);
            res.send({
                message: 'data_set_id parameter is missing',
            });
            return;
        }

        this.blockchain.getRootHash(dataset_id).then((dataRootHash) => {
            if (dataRootHash) {
                if (!Utilities.isZeroHash(dataRootHash)) {
                    res.status(200);
                    res.send({
                        root_hash: dataRootHash,
                    });
                } else {
                    res.status(404);
                    res.send({
                        message: `Root hash not found for ${dataset_id}`,
                    });
                }
            } else {
                res.status(500);
                res.send({
                    message: `Failed to get root hash for ${dataset_id}`,
                });
            }
        }).catch((err) => {
            res.status(500);
            res.send({
                message: err,
            });
        });
    }
}

module.exports = DVController;

