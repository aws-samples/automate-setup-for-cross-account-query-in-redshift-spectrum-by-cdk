// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const redshift = new AWS.Redshift();

exports.handler = async event => {
    const clusterId = event.ResourceProperties.ClusterIdentifier;
    const roleArn = event.ResourceProperties.RoleArn;

    var data = await redshift.describeClusters({ ClusterIdentifier: clusterId }).promise();
    if (data.Clusters.length != 1) {
        throw new Error(`Unable to find cluster ${clusterId}`);
    }

    console.log(`Set this role as default ${roleArn}`)
    // received: UnexpectedParameter: Unexpected key 'DefaultIamRoleArn' found in params
    // maybe a bug: https://github.com/aws/aws-cdk/issues/18186
    // await redshift.modifyClusterIamRoles({
    //     ClusterIdentifier: clusterId,
    //     DefaultIamRoleArn: roleArn
    // }).promise();
    console.log(`Cluster ${clusterId} default role set.`)
};
