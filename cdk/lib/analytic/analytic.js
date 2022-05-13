// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const { Constants } = require(path.join(__dirname, '../constants'));
const { RedshiftStack } = require(path.join(__dirname, 'redshift'));
const { VpcStack } = require(path.join(__dirname, 'vpc'));

class AnalyticStack extends cdk.Stack {
    vpcStack;
    redshiftStack;

    vpcId;
    secretName;

    constructor(scope, props) {
        super(scope, `${Constants.PREFIX}-analytic`, props);

        this.vpcStack = new VpcStack(this);
        this.redshiftStack = new RedshiftStack(this, this.vpcStack);
        this.output();
    }

    output() {
        this.exportValue(this.vpcStack.vpc.vpcId, { name: `${this.stackName}-vpc-id` });
        this.exportValue(this.redshiftStack.cluster.secret.secretName, { name: `${this.stackName}-secret-name` });
    }
}

module.exports = { AnalyticStack }
