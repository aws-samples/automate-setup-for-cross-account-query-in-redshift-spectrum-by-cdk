#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

readonly PREFIX="caq"
readonly OUTPUT_FILE="/tmp/${PREFIX}-output.txt"

function usage() {
  echo "Usage:"
  echo "./bin/deploy.sh"
  echo
  echo "Set the following environmental variables:"
  echo " - AWS_DEFAULT_REGION: the AWS region to deploy into."
  echo " - ANALYTIC_ACCOUNT:   the analytic AWS account ID"
  echo " - ANALYTIC_PROFILE:   the AWS CLI profile for analytic account"
  echo " - SERVERLESS_ACCOUNT: the serverless AWS account ID"
  echo " - SERVERLESS_PROFILE: the AWS CLI profile for serverless account"
  echo " - STORAGE_ACCOUNT:    the storage AWS account ID"
  echo " - STORAGE_PROFILE:    the AWS CLI profile for storage account"
  exit 1
}

function check_env() {
  if [ -z ${AWS_DEFAULT_REGION} ] ||
    [ -z ${ANALYTIC_ACCOUNT} ] ||
    [ -z ${ANALYTIC_PROFILE} ] ||
    [ -z ${SERVERLESS_ACCOUNT} ] ||
    [ -z ${SERVERLESS_PROFILE} ] ||
    [ -z ${STORAGE_ACCOUNT} ] ||
    [ -z ${STORAGE_PROFILE} ]; then
    usage
  else
    echo ""
    echo "Environment check is ok."
    echo "Deploy to region: ${AWS_DEFAULT_REGION}"
    echo "Analytic account: ${ANALYTIC_ACCOUNT}"
    echo "Serverless account: ${SERVERLESS_ACCOUNT}"
    echo "Storage account: ${STORAGE_ACCOUNT}"
  fi
}

function deploy_logs() {
  echo ""
  echo "Deploy to storage account - logs bucket"
  cdk deploy ${PREFIX}-logs --require-approval never --profile ${STORAGE_PROFILE} --outputs-file ${OUTPUT_FILE}
  if [ $? != 0 ]; then
    echo "Failed to deploy the logs stack."
    exit 1
  fi
}

function deploy_analytic() {
  echo ""
  echo "Deploy to analytic account"
  cdk deploy ${PREFIX}-analytic --require-approval never --profile ${ANALYTIC_PROFILE} --outputs-file ${OUTPUT_FILE}
  if [ $? != 0 ]; then
    echo "Failed to deploy the analytic stack."
    exit 1
  fi

  local -r vpcId=$(cat ${OUTPUT_FILE} | jq -r .\"${PREFIX}-analytic\".Exportcaqanalyticvpcid)
  local -r secretName=$(cat ${OUTPUT_FILE} | jq -r .\"${PREFIX}-analytic\".Exportcaqanalyticsecretname)
  echo "Analytic VPC ID: ${vpcId}"
  echo "Analytic secret name: ${secretName}"

  export ANALYTIC_CLUSTER_SECRET=${secretName}
  export ANALYTIC_VPC=${vpcId}
}

function deploy_storage() {
  echo ""
  echo "Deploy to storage account"
  cdk deploy ${PREFIX}-storage --require-approval never --profile ${STORAGE_PROFILE} --outputs-file ${OUTPUT_FILE}
  if [ $? != 0 ]; then
    echo "Failed to deploy the storage stack."
    exit 1
  fi

  local -r bucketKey=$(cat ${OUTPUT_FILE} | jq -r .\"${PREFIX}-storage\".Exportcaqstoragebucketkey)
  echo "Storage bucket key: ${bucketKey}"

  export STORAGE_BUCKET_KEY=${bucketKey}
}

function deploy_serverless() {
  echo ""
  echo "Deploy to serverless account"
  cdk deploy ${PREFIX}-serverless --require-approval never --profile ${SERVERLESS_PROFILE} --outputs-file ${OUTPUT_FILE}
  if [ $? != 0 ]; then
    echo "Failed to deploy the serverless stack."
    exit 1
  fi
}

function deploy() {
  echo ""
  echo "Deploy the solution to your AWS accounts."
  check_env

  echo ""
  echo "Dryrun the CDK project."

  # set a dummy bucket key temporarily
  export STORAGE_BUCKET_KEY="00000000-0000-0000-0000-000000000000"
  cdk ls --profile ${ANALYTIC_PROFILE}
  if [ $? != 0 ]; then
    echo "CDK dryrun failed."
    exit 1
  fi

  deploy_logs
  deploy_analytic
  deploy_storage
  deploy_serverless

  echo "Bye."
}

deploy
