// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const sqs = require('aws-cdk-lib/aws-sqs');
const sources = require('aws-cdk-lib/aws-lambda-event-sources');
const { Serverless } = require(path.join(__dirname, 'constants'));

class SqsStack extends cdk.NestedStack {
    queue;
    deadQueue;
    eventSource;

    constructor(scope, glueStack) {
        super(scope, "sqs");

        this.deadQueue = this.createDeadQueue(glueStack.key);
        this.queue = this.createQueue(glueStack.key);
        this.eventSource = this.createEventSource();
    }

    createDeadQueue(key) {
        return new sqs.Queue(this, "dead", {
            queueName: Serverless.DEAD_QUEUE_NAME,
            encryption: sqs.QueueEncryption.KMS,
            encryptionMasterKey: key,
        });
    }

    createQueue(key) {
        return new sqs.Queue(this, "queue", {
            queueName: Serverless.QUEUE_NAME,
            encryption: sqs.QueueEncryption.KMS,
            encryptionMasterKey: key,
            deadLetterQueue: {
                queue: this.deadQueue,
                maxReceiveCount: 10,
            },
            dataKeyReuse: cdk.Duration.hours(1),
            retentionPeriod: cdk.Duration.hours(1),
            visibilityTimeout: cdk.Duration.hours(1), // 6 * function timeout (15) + batch window (2)
        });
    }

    createEventSource() {
        return new sources.SqsEventSource(this.queue, {
            enabled: true,
            batchSize: 1000,
            maxBatchingWindow: cdk.Duration.minutes(2), // we want to process as many as possible
        });
    }
}

module.exports = { SqsStack }
