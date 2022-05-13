#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

readonly PREFIX="caq"

function usage() {
    echo "Usage:"
    echo "./bin/destroy.sh"
    echo
    echo "Set the following environmental variables:"
    echo " - AWS_DEFAULT_REGION: the AWS region to deploy into."
    echo " - ANALYTIC_PROFILE:   the AWS CLI profile for analytic account"
    echo " - SERVERLESS_PROFILE: the AWS CLI profile for serverless account"
    echo " - STORAGE_PROFILE:    the AWS CLI profile for storage account"
    exit 1
}

function check_env() {
    if [ -z ${AWS_DEFAULT_REGION} ] ||
        [ -z ${ANALYTIC_PROFILE} ] ||
        [ -z ${SERVERLESS_PROFILE} ] ||
        [ -z ${STORAGE_PROFILE} ]; then
        usage
    else
        echo ""
        echo "Environment check is ok."
        echo "Destroy in region: ${AWS_DEFAULT_REGION}"
    fi
}

function destroy() {
    echo ""
    echo "Destroy the solution in your AWS accounts."
    check_env

    cdk destroy ${PREFIX}-serverless --force --profile ${SERVERLESS_PROFILE}
    cdk destroy ${PREFIX}-storage --force --profile ${STORAGE_PROFILE}
    cdk destroy ${PREFIX}-analytic --force --profile ${ANALYTIC_PROFILE}
    cdk destroy ${PREFIX}-logs --force --profile ${STORAGE_PROFILE}
}

destroy
