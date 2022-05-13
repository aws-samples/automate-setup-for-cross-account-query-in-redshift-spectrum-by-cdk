// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { Constants } = require(path.join(__dirname, '../constants'));

class Storage {
    static DATA_BUCKET_NAME = `${Constants.PREFIX}-data-${process.env.CDK_DEFAULT_REGION}-${process.env.STORAGE_ACCOUNT}`; // must be lowercase
    static LOGS_BUCKET_NAME = `${Constants.PREFIX}-logs-${process.env.CDK_DEFAULT_REGION}-${process.env.STORAGE_ACCOUNT}`; // must be lowercase
    
    static BUCKET_KEY_PREFIX = "landing/";

    static ROLE_FOR_REDSHIFT = `${Constants.PREFIX}-s3-role-for-redshift`;
    static RULE_ROLE = `${Constants.PREFIX}-storage-rule-role`;

    static STORAGE_TO_SERVERLESS_RULE = `${Constants.PREFIX}-storage-to-serverless-rule`;
}

module.exports = { Storage }
