// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0


const AWS = require('aws-sdk');
const sf = new AWS.StepFunctions();

/**
 * The S3 event collector. It retrieves S3 events, and groups them based on schema and table.
 * Then it invokes the state machine with grouped information.
 */
class EventCollector {
    items;

    constructor(items) {
        this.items = items;
    }

    async distribute() {
        const pathMap = new Map();
        for (const item of this.items) {
            pathMap.set(item.path, item);
        }

        console.log(`Obtained ${pathMap.size} different paths`);

        for (const [k, v] of pathMap) {
            const result = await sf.startExecution({
                stateMachineArn: process.env.MACHINE_ARN,
                input: JSON.stringify(v)
            }).promise();
            console.log(`Started execution ${result.executionArn} with item ${JSON.stringify(v)}`);
        }
    }
}

module.exports = { EventCollector }
