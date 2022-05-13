// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const { Constants } = require(path.join(__dirname, '../constants'));
const { GlueStack } = require(path.join(__dirname, 'glue'));
const { GlueComponentsStack } = require(path.join(__dirname, 'glue-components'));
const { CollectorStack } = require(path.join(__dirname, 'lambda-collector'));
const { LoaderStack } = require(path.join(__dirname, 'lambda-loader'));
const { VpcStack } = require(path.join(__dirname, 'vpc'));
const { EventStack } = require(path.join(__dirname, 'event'));
const { SqsStack } = require(path.join(__dirname, 'sqs'));
const { MachineStack } = require(path.join(__dirname, 'machine'));

class ServerlessStack extends cdk.Stack {
    vpcStack;
    glueStack;
    glueComponentsStack;
    sqsStack;
    loaderStack;
    collectorStack;
    machineStack;

    vpcId;

    constructor(scope, props) {
        super(scope, `${Constants.PREFIX}-serverless`, props);

        this.vpcStack = new VpcStack(this);

        this.glueStack = new GlueStack(this);
        this.sqsStack = new SqsStack(this, this.glueStack);
        this.loaderStack = new LoaderStack(this, this.glueStack);
        this.glueComponentsStack = new GlueComponentsStack(this, this.glueStack, this.vpcStack);

        this.machineStack = new MachineStack(this, this.glueStack);
        new EventStack(this, this.sqsStack, this.machineStack);
        this.collectorStack = new CollectorStack(this, this.glueStack, this.sqsStack, this.machineStack);
        this.output();
    }

    output() {
        this.exportValue(this.vpcStack.vpc.vpcId, { name: `${this.stackName}-vpc-id` });
    }
}

module.exports = { ServerlessStack }
