// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const { Storage } = require(path.join(__dirname, 'constants'));

class EventStack extends cdk.NestedStack {
    role;
    rule;
    serverlessEventBus;

    constructor(scope, s3Stack) {
        super(scope, "event");

        this.serverlessEventBus = this.formatArn({
            service: "events", account: process.env.SERVERLESS_ACCOUNT,
            resource: "event-bus", resourceName: "default"
        });
        this.role = this.createRuleRole();
        this.rule = this.createS3Event(s3Stack.dataBucket);
    }

    createRuleRole() {
        const role = new iam.Role(this, "rule-role", {
            roleName: Storage.RULE_ROLE,
            assumedBy: new iam.ServicePrincipal("events.amazonaws.com")
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["events:PutEvents"],
            resources: [this.serverlessEventBus]
        }));
        return role;
    }

    createS3Event(bucket) {
        return new events.Rule(this, "send-to-serverless-rule", {
            ruleName: Storage.STORAGE_TO_SERVERLESS_RULE,
            description: "Rule to send to server less account",
            eventPattern: {
                source: ["aws.s3"],
                detailType: ["Object Created", "Object Deleted"],
                detail: {
                    "bucket": { "name": [bucket.bucketName] },
                    "object": { "key": [{ "prefix": Storage.BUCKET_KEY_PREFIX }] }
                }
            },
            targets: [new targets.EventBus(
                events.EventBus.fromEventBusArn(
                    this, "event-serverless-event-bus", this.serverlessEventBus),
                { role: this.role })]
        });
    }

}

module.exports = { EventStack }
