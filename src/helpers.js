const Apify = require('apify');
const { log, requestAsBrowser, sleep } = Apify.utils;

const { BASE_URL, PAGE_SIZE } = require('./constants');


function constructApiUrl(isViewAll, dataProductsUrl, productType) {
    let apiUrl;

    if (isViewAll) apiUrl = `${BASE_URL}${dataProductsUrl}`;
    else apiUrl = `${BASE_URL}${dataProductsUrl}?product-type=${productType}`;
    console.log('apiUrl', apiUrl);

    return apiUrl;
}

async function getTotalNumOfProds(apiUrl, isViewAll, proxyUrls) {
    const res = await requestAsBrowser({
        url: apiUrl + (isViewAll ? '?' : '&') + `page-size=${PAGE_SIZE}`,
        abortFunction: false,
        proxyUrl: proxyUrls[0],
        timeoutSecs: 180,
        ignoreSslErrors: true
    });
    const { total } = JSON.parse(res.body);

    return total;
}

async function getAllProductsByChunks(total, apiUrl, isViewAll, proxyUrls) {
    let productsArray = [];
    const numOfReqs = Math.ceil(total / PAGE_SIZE);

    for (let i = 0; i < numOfReqs; i++) {
        const offset = i * PAGE_SIZE;

        const res = await requestAsBrowser({
            url: apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${PAGE_SIZE}`,
            abortFunction: false,
            proxyUrl: proxyUrls[0],
            timeoutSecs: 180,
            ignoreSslErrors: true
        });
        console.log('req', i, apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${PAGE_SIZE}`);

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
        // if script is null, I can try $.find('script:contains("var productArticleDetails")')[0]; !!!
        const scriptContent = $('script:contains("var productArticleDetails")').html(); // !!!!!!!!!! $($.find('script:contains("var productArticleDetails")')[0]).html()
        const start = scriptContent.indexOf('var productArticleDetails = '); // + 28
        const end = scriptContent.length;
        const dataString = scriptContent.substr(start, end);
        dataString.trim();
        eval(dataString); // creates productArticleDetails variable
        productData = productArticleDetails;
    }
    catch (err) {
        // console.log('scriptContent', $('script:contains("var productArticleDetails")'));
        console.log('scriptContent html', $($('script:contains("var productArticleDetails")')).html().slice(0,300));
        console.log('script find!', $.find('script:contains("var productArticleDetails")')[0]);
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
        const scriptContent = $('script:contains("utag_data = ")').html();
        const start = scriptContent.indexOf('utag_data = ');
        let dataString = scriptContent.substr(start);
        const end = dataString.indexOf('};') + 2;
        dataString = dataString.substr(0, end);
        eval(dataString); // creates utag_data variable
        utagData = utag_data;
    }
    catch (err) {
        throw new Error('Web page missing critical data source');
    }

    return utagData;
}

async function getAvailabilityList(groupCode, proxyUrls) {
    const { body } = await requestAsBrowser({
        url: `https://www2.hm.com/hmwebservices/service/product/us/availability/${groupCode}.json`,
        abortFunction: false,
        proxyUrl: proxyUrls[0],
        timeoutSecs: 180,
        ignoreSslErrors: true
    });
    const parsedBody = JSON.parse(body);
    const availability = parsedBody.availability.concat(parsedBody.fewPieceLeft);

    return availability;
}

module.exports = {
    constructApiUrl,
    getTotalNumOfProds,
    getAllProductsByChunks,
    getProductData,
    getUtagData,
    getAvailabilityList
}
