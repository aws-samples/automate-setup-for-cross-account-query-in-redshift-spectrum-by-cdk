// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const { Analytic } = require(path.join(__dirname, 'constants'));

class VpcStack extends cdk.NestedStack {
    vpc;
    securityGroup;

    constructor(scope) {
        super(scope, "vpc");

        this.vpc = this.createVpc();
        this.securityGroup = this.createSecurityGroup();
        this.createGlueEndpoint();
    }

    createVpc() {
        return new ec2.Vpc(this, 'vpc', {
            cidr: Analytic.VPC_CIDR,
            maxAzs: 2,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            // enhanced VPC routing nneds S3 endpoint
            gatewayEndpoints: { "s3e": { service: ec2.GatewayVpcEndpointAwsService.S3 } },
            subnetConfiguration: [{
                cidrMask: 24,
                name: 'isolated',
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED
            }],
            flowLogs: { "allFlowLogs": {} },
        });
    }

    createSecurityGroup() {
        const group = new ec2.SecurityGroup(this, "default-security-group", {
            vpc: this.vpc,
            allowAllOutbound: true
        });
        group.addIngressRule(group, ec2.Port.allTcp(), "allow self-access");
        cdk.Tags.of(group).add("Name", "Analytic security group");
        return group;
    }

    // enhanced VPC routing needs Glue endpoint
    createGlueEndpoint() {
        return new ec2.InterfaceVpcEndpoint(this, "glue-endpoint", {
            vpc: this.vpc,
            privateDnsEnabled: true,
            service: ec2.InterfaceVpcEndpointAwsService.GLUE,
            securityGroups: [this.securityGroup],
            subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED }
        });
    }
}

module.exports = { VpcStack }
