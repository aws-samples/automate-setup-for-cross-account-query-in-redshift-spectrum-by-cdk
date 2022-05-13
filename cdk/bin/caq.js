#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const { LogsStack } = require(path.join(__dirname, '../lib/storage/logs'));
const { AnalyticStack } = require(path.join(__dirname, '../lib/analytic/analytic'));
const { StorageStack } = require(path.join(__dirname, '../lib/storage/storage'));
const { ServerlessStack } = require(path.join(__dirname, '../lib/serverless/serverless'));

const app = new cdk.App();
new LogsStack(app, {
    env: {
        account: process.env.STORAGE_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
new AnalyticStack(app, {
    env: {
        account: process.env.ANALYTIC_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
new StorageStack(app, {
    env: {
        account: process.env.STORAGE_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
new ServerlessStack(app, {
    env: {
        account: process.env.SERVERLESS_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});

