// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { Constants } = require(path.join(__dirname, '../constants'));

class Serverless {
    static VPC_CIDR = "10.1.0.0/16";

    static GLUE_ROLE_FOR_REDSHIFT = `${Constants.PREFIX}-glue-role-for-redshift`;
    static GLUE_S3_CONNECTION = `${Constants.PREFIX}-glue-s3-connection`;
    static GLUE_SECURITY_CONFIG = `${Constants.PREFIX}-glue-default-security-config`;
    static GLUE_SERVICE_ROLE = `${Constants.PREFIX}-glue-service-role`;

    static SERVERLESS_TO_QUEUE_RULE = `${Constants.PREFIX}-serverless-to-queue-rule`;
    static SERVERLESS_TO_MACHINE_RULE = `${Constants.PREFIX}-serverless-to-machine-rule`;
    static COLLECT_S3_EVENT_RULE = `${Constants.PREFIX}-collect-s3-event-rule`;

    static LAMBDA_LOADER = `${Constants.PREFIX}-lambda-loader`;
    static LAMBDA_LOADER_ROLE = `${Constants.PREFIX}-loader-service-role`;

    static LAMBDA_COLLECTOR = `${Constants.PREFIX}-lambda-collector`;
    static LAMBDA_COLLECTOR_ROLE = `${Constants.PREFIX}-collector-service-role`;

    static QUEUE_NAME = `${Constants.PREFIX}-s3-event-queue`;
    static DEAD_QUEUE_NAME = `${Constants.PREFIX}-s3-dead-queue`;

    static MACHINE_NAME = `${Constants.PREFIX}-loader-machine`;
    static MACHINE_LOADER_ROLE = `${Constants.PREFIX}-machine-loader-role`;
    static MACHINE_TO_ANALYZE_ROLE = `${Constants.PREFIX}-machine-to-analyze-role`;
}

module.exports = { Serverless }
