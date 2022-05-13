// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const { Constants } = require(path.join(__dirname, '../constants'));
const { EventStack } = require(path.join(__dirname, 'event'));
const { S3Stack } = require(path.join(__dirname, 's3'));

class StorageStack extends cdk.Stack {
  s3Stack;

  bucketKey;

  constructor(scope, props) {
    super(scope, `${Constants.PREFIX}-storage`, props);

    this.s3Stack = new S3Stack(this);
    new EventStack(this, this.s3Stack);

    this.output();
  }

  output() {
    this.exportValue(this.s3Stack.key.keyId, { name: `${this.stackName}-bucket-key` });
  }
}

module.exports = { StorageStack }
