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
    const proxyUrls = getProxyUrls(proxyConfiguration, true); // const proxyUrls = undefined;
    console.log('proxyUrls', proxyUrls);

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
    if (extendOutputFunction)
        evaledFunc = checkAndEval(extendOutputFunction);

    // crawler config
    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        maxRequestRetries: 3,
        handlePageTimeoutSecs: 240,
        requestTimeoutSecs: 120,
        proxyUrls,

        handlePageFunction: async ({ request, body, $ }) => {
            // if exists, check items limit. If limit is reached crawler will exit.
            if (maxItems) maxItemsCheck(maxItems, itemCount, requestQueue);

            log.info('Processing:', request.url);
            const { label } = request.userData;

            //

            if (label === 'HOMEPAGE') {
                const totalEnqueued = await enqueueMainCategories($, requestQueue);

                log.info(`Enqueued ${totalEnqueued} main-categories from the homepage.`);
            }

            if (label === 'MAINCAT') {
                const enqueuedUrl = await enqueueSubcategories($, requestQueue);

                log.info(`Enqueued ${enqueuedUrl} from ${request.url}`);
            }

            if (label === 'SUBCAT') {
                const productLinks = await extractSubcatPage($, request, proxyUrls);

                for (const link of productLinks) {
                    await requestQueue.addRequest({
                        url: BASE_URL + link,
                        userData: { label: 'PRODUCT' },
                    });
                }

                log.info(`Added ${productLinks.length} products from ${request.url}`);
            }

            if (label === 'PRODUCT') {
                let item = await extractProductPage($, request, proxyUrls);

                if (extendOutputFunction)
                    item = await applyFunction($, evaledFunc, item);

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
