#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const { StoragePipeline } = require(path.join(__dirname, '../lib/pipeline/storage-pipeline'));

const app = new cdk.App();
new StoragePipeline(app);
app.synth();
