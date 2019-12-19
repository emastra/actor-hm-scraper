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
        proxyUrl: proxyUrls[0]
    });
    const { total } = JSON.parse(res.body);

    return total;
}

async function getAllProductsByChunks(total, apiUrl, isViewAll, proxyUrls) {
    let data = Object.create(null);
    const numOfReqs = Math.ceil(total / PAGE_SIZE);

    for (let i = 0; i < numOfReqs; i++) {
        const offset = i * PAGE_SIZE;

        const res = await requestAsBrowser({
            url: apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${PAGE_SIZE}`,
            abortFunction: false,
            proxyUrl: proxyUrls[0]
        });
        console.log('req', i, apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${PAGE_SIZE}`);

        const resData = JSON.parse(res.body);
        data = { ...data, ...resData };

        await sleep(1000);
    }

    return data;
}

function getProductData($) {
    // init following variable to support eval
    const isDesktop = true;

    const scriptContent = $('script:contains("var productArticleDetails")').html();
    const start = scriptContent.indexOf('var productArticleDetails = '); // + 28
    const end = scriptContent.length;
    const dataString = scriptContent.substr(start, end);
    dataString.trim();
    eval(dataString); // creates productArticleDetails variable
    const productData = productArticleDetails;

    return productData;
}

function getUtagData($) {
    // init some variables to support eval
    const [osaArea, osaType, virtualCategory] = Array(3).fill(undefined);
    const [getTouchpoint, utagTealiumTrack] = Array(2).fill(() => undefined);

    const scriptContent = $('script:contains("utag_data = ")').html();
    const start = scriptContent.indexOf('utag_data = ');
    let dataString = scriptContent.substr(start);
    const end = dataString.indexOf('};') + 2;
    dataString = dataString.substr(0, end);
    eval(dataString); // creates utag_data variable
    const utagData = utag_data;

    return utagData;
}

async function getAvailabilityList(groupCode) {
    const { body } = await requestAsBrowser({
        url: `https://www2.hm.com/hmwebservices/service/product/us/availability/${groupCode}.json`,
        abortFunction: false,
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
