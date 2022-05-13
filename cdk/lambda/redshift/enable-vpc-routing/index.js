// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const redshift = new AWS.Redshift();

exports.handler = async event => {
    const clusterId = event.ResourceProperties.ClusterIdentifier;

    var data = await redshift.describeClusters({ ClusterIdentifier: clusterId }).promise();
    if (data.Clusters.length != 1) {
        throw new Error(`Unable to find cluster ${clusterId}`);
    }

    if (data.Clusters[0].EnhancedVpcRouting) {
        console.log(`The EnhancedVpcRouting is already enabled for cluster ${clusterId}`);
        return;
    }

    await redshift.modifyCluster({
        ClusterIdentifier: clusterId,
        EnhancedVpcRouting: true
    }).promise();
    console.log(`Cluster ${clusterId} EnhancedVpcRouting enabled.`)
};
