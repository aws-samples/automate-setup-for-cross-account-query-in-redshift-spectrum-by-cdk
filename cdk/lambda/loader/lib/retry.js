// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const retry = async (fn, obj, args = [], max = 3, count = 0) => {
    try {
        const suffix = count % 10 == 1 ? "st" : count % 10 == 2 ? "nd" : count % 10 == 3 ? "rd" : "th";
        console.log(`Retry for the ${count}${suffix} time.`);
        return await fn.apply(obj, args);
    } catch (e) {
        if (count >= max) {
            console.log(`Max retries ${max} reached, stop retrying.`);
            throw e;
        }
        await wait(2 ** count * 1000); // start with 2 seconds, then 4, 8, 16
        return retry(fn, obj, args, max, ++count);
    }
};

module.exports = { retry }
