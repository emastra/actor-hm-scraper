const Apify = require('apify');
const { BASE_URL, PAGE_SIZE } = require('./constants');

const { log, requestAsBrowser, sleep } = Apify.utils;

function constructApiUrl(isViewAll, dataProductsUrl, productType) {
    let apiUrl;

    if (isViewAll) apiUrl = `${BASE_URL}${dataProductsUrl}`;
    else apiUrl = `${BASE_URL}${dataProductsUrl}?product-type=${productType}`;

    return apiUrl;
}

async function getTotalNumOfProds(apiUrl, isViewAll, proxyUrls) {
    const res = await requestAsBrowser({
        url: `${apiUrl + (isViewAll ? '?' : '&')}page-size=${PAGE_SIZE}`,
        proxyUrl: proxyUrls ? proxyUrls.newUrl() : undefined,
        timeoutSecs: 180,
        ignoreSslErrors: true,
    });
    const { total } = JSON.parse(res.body);

    return total;
}

async function getAllProductsByChunks(total, apiUrl, isViewAll, proxyUrls) {
    const productsArray = [];
    const numOfReqs = Math.ceil(total / PAGE_SIZE);

    log.info('Paginating...');
    for (let i = 0; i < numOfReqs; i++) {
        const offset = i * PAGE_SIZE;

        const res = await requestAsBrowser({
            url: `${apiUrl + (isViewAll ? '?' : '&')}offset=${offset}&page-size=${PAGE_SIZE}`,
            proxyUrl: proxyUrls ? proxyUrls.newUrl() : undefined,
            timeoutSecs: 180,
            ignoreSslErrors: true,
        });

        const resData = JSON.parse(res.body);
        const { products } = resData;

        productsArray.push(...products);

        await sleep(1000);
    }

    return productsArray;
}

function getProductData($) {
    // init following variable to support eval
    const isDesktop = true;

    let productData;

    try {
        const scriptTag = $('script:contains("var productArticleDetails")')
            ? $('script:contains("var productArticleDetails")')
            : $($.find('script:contains("var productArticleDetails")')[0]);

        const scriptContent = scriptTag.html();
        const start = scriptContent.indexOf('var productArticleDetails = '); // + 28
        const end = scriptContent.length;
        const dataString = scriptContent.substr(start, end);
        dataString.trim();
        eval(dataString); // creates productArticleDetails variable
        productData = productArticleDetails;
    } catch (err) {
        throw new Error('Web page missing critical data source');
    }

    return productData;
}

function getUtagData($) {
    // init some variables to support eval
    const [osaArea, osaType, virtualCategory] = Array(3).fill(undefined);
    const [getTouchpoint, utagTealiumTrack] = Array(2).fill(() => undefined);

    let utagData;

    try {
        const scriptTag = $('script:contains("utag_data = ")')
            ? $('script:contains("utag_data = ")')
            : $($.find('script:contains("utag_data = ")')[0]);

        const scriptContent = scriptTag.html();
        const start = scriptContent.indexOf('utag_data = ');
        let dataString = scriptContent.substr(start);
        const end = dataString.indexOf('};') + 2;
        dataString = dataString.substr(0, end);
        eval(dataString); // creates utag_data variable
        utagData = utag_data;
    } catch (err) {
        throw new Error('Web page missing critical data source');
    }

    return utagData;
}

async function getAvailabilityList(groupCode, proxyUrls, count = 0) {
    if (count > 1) throw new Error('Web page missing critical data source');
    let availability;

    try {
        const { body } = await requestAsBrowser({
            url: `https://www2.hm.com/hmwebservices/service/product/us/availability/${groupCode}.json`,
            proxyUrl: proxyUrls ? proxyUrls.newUrl() : undefined,
            timeoutSecs: 180,
            ignoreSslErrors: true,
            json: true,
        });

        availability = body.availability.concat(body.fewPieceLeft);
    } catch (err) {
        availability = await getAvailabilityList(groupCode, proxyUrls, count + 1);
    }

    return availability;
}

module.exports = {
    constructApiUrl,
    getTotalNumOfProds,
    getAllProductsByChunks,
    getProductData,
    getUtagData,
    getAvailabilityList,
};
