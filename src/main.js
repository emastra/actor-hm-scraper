const Apify = require('apify');

const { log } = Apify.utils;

const { BASE_URL } = require('./constants');

const {
    enqueueMainCategories,
    enqueueSubcategories,
    extractSubcatPage,
    extractProductPage,
} = require('./extractors');

const {
    validateInput,
    getProxyUrls,
    checkAndCreateUrlSource,
    maxItemsCheck,
    checkAndEval,
    applyFunction,
} = require('./utils');

//

Apify.main(async () => {
    const input = await Apify.getInput();
    validateInput(input);

    const {
        startUrls,
        maxItems = null,
        extendOutputFunction = null,
        proxyConfiguration,
    } = input;

    // create proxy url(s) to be used in crawler configuration
    const proxyUrls = getProxyUrls(proxyConfiguration, true);
    if (!proxyUrls) log.warning('No proxy is configured');

    // initialize request list from url sources
    const sources = checkAndCreateUrlSource(startUrls);
    const requestList = await Apify.openRequestList('start-list', sources);

    // open request queue
    const requestQueue = await Apify.openRequestQueue();

    // open dataset and get itemCount
    const dataset = await Apify.openDataset();
    let { itemCount } = await dataset.getInfo();

    // if exists, evaluate extendOutputFunction
    let evaledFunc;
    if (extendOutputFunction) evaledFunc = checkAndEval(extendOutputFunction);

    // crawler config
    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        maxRequestRetries: 3,
        handlePageTimeoutSecs: 360,
        requestTimeoutSecs: 240,
        maxConcurrency: 20,
        proxyUrls,

        handlePageFunction: async ({ request, body, $ }) => {
            // if exists, check items limit. If limit is reached crawler will exit.
            if (maxItems) maxItemsCheck(maxItems, itemCount);

            log.info('Processing:', request.url);
            const { label } = request.userData;

            //

            if (label === 'HOMEPAGE') {
                const totalEnqueued = await enqueueMainCategories($, requestQueue);
                log.info(`Enqueued ${totalEnqueued} main-categories from the homepage.`);
            }

            if (label === 'MAINCAT') {
                await enqueueSubcategories($, requestQueue);
                log.info(`Enqueued subcategories from ${request.url}`);
            }

            if (label === 'SUBCAT') {
                const productInfo = await extractSubcatPage($, request, proxyUrls);

                for (const obj of productInfo) {
                    await requestQueue.addRequest({
                        url: BASE_URL + obj.link,
                        userData: { label: 'PRODUCT', category: obj.category },
                    });
                }

                log.info(`Added ${productInfo.length} products from ${request.url}`);
            }

            if (label === 'PRODUCT') {
                const { category } = request.userData;

                let item = await extractProductPage($, request, proxyUrls, category);

                if (extendOutputFunction) item = await applyFunction($, evaledFunc, item);

                await dataset.pushData(item);
                itemCount++;
                log.info('Product pushed:', item.itemId, item.color);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.warning(`Request ${request.url} failed too many times`);

            await dataset.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    log.info('Starting crawler.');
    await crawler.run();

    log.info('Crawler Finished.');
});
