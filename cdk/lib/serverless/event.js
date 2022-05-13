// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const { Serverless } = require(path.join(__dirname, 'constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));

class EventStack extends cdk.NestedStack {

    constructor(scope, sqsStack, machineStack) {
        super(scope, "event");

        this.updateCfnEventBusPolicy();
        this.createSendCreatedToQueueRule(sqsStack.queue);
        this.createSendDeletedToMachineRule(machineStack.machine);
    }

    // the following code is not working, need to use another way.
    updateEventBusPolicy() {
        const eventBus = events.EventBus.fromEventBusName(this, "event-bus", "default");
        eventBus.grantPutEventsTo(new iam.ArnPrincipal(this.formatArn({
            service: "iam", account: process.env.STORAGE_ACCOUNT, region: "",
            resource: "role", resourceName: Storage.RULE_ROLE
        })));
    }

    updateCfnEventBusPolicy() {
        return new events.CfnEventBusPolicy(this, "allow-storage-rule-policy", {
            statementId: "allow-storage-rule-policy",
            statement: {
                "Effect": "Allow",
                "Principal": {
                    "AWS": this.formatArn({
                        arnFormat: cdk.ArnFormat.NO_RESOURCE_NAME,
                        service: "iam", region: "", account: process.env.STORAGE_ACCOUNT,
                        resource: "root"
                    })
                },
                "Action": ["events:PutEvents"],
                "Resource": this.formatArn({
                    service: "events", resource: "event-bus", resourceName: "default"
                }),
                "Condition": {
                    "ArnEquals": {
                        "aws:SourceArn": this.formatArn({
                            service: "events", account: process.env.STORAGE_ACCOUNT,
                            resource: "rule", resourceName: Storage.STORAGE_TO_SERVERLESS_RULE
                        })
                    }
                }
            }
        });
    }

    createSendCreatedToQueueRule(queue) {
        return new events.Rule(this, "send-to-queue-rule", {
            ruleName: Serverless.SERVERLESS_TO_QUEUE_RULE,
            description: "send created s3 event to queue",
            eventPattern: {
                source: ["aws.s3"],
                detailType: ["Object Created"],
                detail: {
                    "bucket": { "name": [Storage.DATA_BUCKET_NAME] },
                    "object": { "key": [{ "prefix": Storage.BUCKET_KEY_PREFIX }] }
                }
            },
            targets: [new targets.SqsQueue(queue)]
        });
    }

    createSendDeletedToMachineRule(machine) {
        return new events.Rule(this, "send-to-machine-rule", {
            ruleName: Serverless.SERVERLESS_TO_MACHINE_RULE,
            description: "send deleted s3 event to machine",
            eventPattern: {
                source: ["aws.s3"],
                detailType: ["Object Deleted"],
                detail: {
                    "bucket": { "name": [Storage.DATA_BUCKET_NAME] },
                    "object": { "key": [{ "prefix": Storage.BUCKET_KEY_PREFIX }] }
                }
            },
            targets: [new targets.SfnStateMachine(machine)]
        });
    }
}

module.exports = { EventStack }
