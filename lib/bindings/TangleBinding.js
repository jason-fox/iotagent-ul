/*
 * Copyright 2016 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of iotagent-ul
 *
 * iotagent-ul is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-ul is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-ul.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[iot_support@tid.es]
 */

const async = require('async');

const iotaClient = require('@iota/client');
//const iotAgentLib = require('iotagent-node-lib');
const commonBindings = require('./../commonBindings');
const utils = require('../iotaUtils');
const ulParser = require('../ulParser');
const constants = require('../constants');
let tangle;
const config = require('../configService');
const context = {
    op: 'IOTAUL.IOTA-Tangle.Binding'
};
const transport = 'IOTA-Tangle';

function getMessageId(payload) {
    let messageId = null;
    try {
        messageId = tangle.getMessageId(payload);
    } catch (e) {
        messageId = getMessageId(payload);
    }
    return messageId;
}

/**
 * Generate the list of global topics to listen to.
 */
function generateTopics() {
    const topics = [];

    if (config.getConfig().tangle && config.getConfig().tangle.messagePath) {
        const messagePath = 'messages/indexation/' + config.getConfig().tangle.messagePath + '/';

        config.getLogger().debug(context, 'Generating topics');
        topics.push(messagePath + constants.MEASURES_SUFIX);
        topics.push(messagePath + constants.CONFIGURATION_SUFIX);
        topics.push(messagePath + constants.CONFIGURATION_COMMAND_SUFIX);
        topics.push(messagePath + constants.CONFIGURATION_COMMAND_UPDATE);
        topics.push(messagePath + constants.CONFIGURATION_VALUES_SUFIX);
    }

    return topics;
}

function start(callback) {
    const tangleConfig = config.getConfig().tangle;
    if (!tangleConfig) {
        config.getLogger().fatal(context, 'Error IOTA Tangle is not configured');
        return callback();
    }

    const retries = tangleConfig.retries ? tangleConfig.retries : constants.MQTT_DEFAULT_RETRIES;
    const retryTime = tangleConfig.retryTime ? tangleConfig.retryTime : constants.MQTT_DEFAULT_RETRY_TIME;
    let isConnecting = false;
    let numRetried = 0;

    /**
     * Recreate the IOTA Tangle subscriptions.
     */
    async function recreateSubscriptions(tangle, callback) {
        const topics = generateTopics();
        config.getLogger().debug('Subscribing to topics: %j', topics);

        try {
            /*await tangle
                .subscriber()
                .topics(topics)
                .subscribe((err, data) => {    
                    if (data) {
                        const messageId = getMessageId(data.payload);
                        tangle
                            .getMessage()
                            .data(messageId)
                            // eslint-disable-next-line camelcase
                            .then((message_data) => {
                                // eslint-disable-next-line camelcase
                                const payload = Buffer.from(message_data.message.payload.data, 'hex').toString('utf8');
                                config.getLogger().debug(context, 'message_data received from Tangle:', payload);
                            })
                            .catch((err) => {
                                config.getLogger().debug(context, err);
                            });
                    }
                });*/
            callback();
        } catch (e) {
            callback(e);
        }
    }

    function createConnection(callback) {
        config.getLogger().info(context, 'creating connection');
        if (isConnecting) {
            return;
        }
        isConnecting = true;
        tangle = new iotaClient.ClientBuilder().node(tangleConfig.url).build();
        isConnecting = false;
        tangle
            .getInfo()
            .then((data) => {
                config.getLogger().info(context, 'IOTA Tangle Binding listening at %s', tangleConfig.url);

                config.getLogger().debug(context, '%j', data);
                return callback(null, tangle);
            })
            .catch((err) => {
                config.getLogger().error(context, 'error IOTA Tangle Client not created' + err);
                if (numRetried <= retries) {
                    numRetried++;
                    return setTimeout(createConnection, retryTime * 1000, callback);
                }
                return callback(err);
            });
    }

    async.waterfall([createConnection, recreateSubscriptions], function (error) {
        if (error) {
            config.getLogger().debug('MQTT error %j', error);
        }
        callback();
    });
}

async function stop(callback) {
    if (tangle) {
        config.getLogger().info(context, 'Stopping Ultralight IOTA Tangle Binding: ');
        const topics = generateTopics();
        await tangle
            .subscriber()
            .topics(topics)
            .unsubscribe((err, data) => {
                config.getLogger().info(context, 'IOTA Tangle Binding Stopped');
            });

        return callback();
    } else {
        return callback();
    }
}

exports.start = start;
exports.stop = stop;

exports.protocol = 'IOTA-Tangle';
