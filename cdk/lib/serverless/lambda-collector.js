// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const lambda = require('aws-cdk-lib/aws-lambda');
const { Serverless } = require(path.join(__dirname, 'constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));

class CollectorStack extends cdk.NestedStack {
    role;
    collector;

    constructor(scope, glueStack, sqsStack, machineStack) {
        super(scope, "collector");

        this.role = this.createServiceRole(glueStack.key, machineStack.machine);
        this.collector = this.createFunction(machineStack.machine);

        // cdk will add sqs permissions to lambda role with this action.
        this.collector.addEventSource(sqsStack.eventSource);
    }

    createServiceRole(key, machine) {
        const role = new iam.Role(this, "service-role", {
            roleName: Serverless.LAMBDA_COLLECTOR_ROLE,
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
            ]
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["kms:Decrypt"], resources: [key.keyArn]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["states:StartExecution"], resources: [machine.stateMachineArn]
        }));
        return role;
    }

    createFunction(machine) {
        return new lambda.Function(this, "function", {
            functionName: Serverless.LAMBDA_COLLECTOR,
            handler: "collect.handler",
            role: this.role,
            retryAttempts: 0,
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(15),
            code: lambda.Code.fromAsset(path.join(__dirname, "../../lambda/loader")),
            environment: {
                "BUCKET_NAME": Storage.DATA_BUCKET_NAME,
                "MACHINE_ARN": machine.stateMachineArn,
            }
        });
    }
}

module.exports = { CollectorStack }
