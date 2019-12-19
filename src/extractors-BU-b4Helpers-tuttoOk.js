const Apify = require('apify');
const { log, requestAsBrowser, sleep } = Apify.utils;

const { BASE_URL, DEFAULT_PAGE_SIZE } = require('./constants');

// Helpers
const constructApiUrl = () => {
    
}


//

// enqueueMainCategories
async function enqueueMainCategories($, requestQueue) {
    const menuAnchors = $('ul.menu__primary').find('a.menu__super-link').toArray();

    for (const anchor of menuAnchors) {
        const info = await requestQueue.addRequest({
            url: BASE_URL + $(anchor).attr('href'),
            userData: {
                label: 'MAINCAT'
            }
        });
        console.log(info.request.url);
    }

    return menuAnchors.length;
}

// enqueueSubcategories
async function enqueueSubcategories($, requestQueue) {
    const viewAllAnchor = $('#menu-links').find('a:contains("View All")');

    // standard main-cat, "View All" is single
    if (viewAllAnchor.length === 1) {
        const info = await requestQueue.addRequest({
            url: BASE_URL + viewAllAnchor.attr('href'),
            forefront: true,
            userData: {
                label: 'SUBCAT'
            }
        });

        return 'View All';
    }

    // "sale" main-cat, "View All" are several
    else {
        const anchors = viewAllAnchor.toArray();

        for (const anchor of anchors) {
            const info = await requestQueue.addRequest({
                url: BASE_URL + $(anchor).attr('href'),
                forefront: true,
                userData: {
                    label: 'SUBCAT'
                }
            });
        }

        return `${anchors.length} subcategories`;
    }

}

// extractSubcatPage
async function extractSubcatPage($, request, proxyUrls) {
    const dataCategory = $('article[data-category]')[0].attribs['data-category'];
    // const productType = dataCategory.split('_').slice(0, 2).join('_');

    const productType = $('input[data-name="product-type"][checked]')[0]
        ? $('input[data-name="product-type"][checked]')[0].attribs.value
        : dataCategory.split('_').slice(0, 2).join('_');

    const dataProductsUrl = $('form[data-filtered-products-url]')[0].attribs['data-filtered-products-url'];

    const isViewAll = request.url.includes('view-all');

    // construct apiUrl
    let apiUrl;
    if (isViewAll) apiUrl = `${BASE_URL}${dataProductsUrl}`;
    else apiUrl = `${BASE_URL}${dataProductsUrl}?product-type=${productType}`;
    console.log('apiUrl', apiUrl);

    // get total
    const res = await requestAsBrowser({
        url: apiUrl + (isViewAll ? '?' : '&') + `page-size=${DEFAULT_PAGE_SIZE}`,
        abortFunction: false,
        proxyUrl: proxyUrls[0]
    });
    const { total } = JSON.parse(res.body);
    console.log(request.url, 'total', total);

    // get all products by chunks
    let data = Object.create(null);
    const numOfReqs = Math.ceil(total / DEFAULT_PAGE_SIZE);

    for (let i = 0; i < numOfReqs; i++) {
        const offset = i * DEFAULT_PAGE_SIZE;

        const res = await requestAsBrowser({
            url: apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${DEFAULT_PAGE_SIZE}`,
            abortFunction: false,
            proxyUrl: proxyUrls[0]
        });
        console.log('req', i, apiUrl + (isViewAll ? '?' : '&') + `offset=${offset}&page-size=${DEFAULT_PAGE_SIZE}`);

        const resData = JSON.parse(res.body);
        data = { ...data, ...resData };

        await sleep(1000);
    }

    const { products } = data;

    const productLinks = [];

    for (const product of products) {
        const { swatches } = product;

        for (const swatch of swatches) {
            productLinks.push(swatch.articleLink);
        }
    }

    console.log(request.url, 'length', productLinks.length);
    return productLinks;
}

// extractProductPage
async function extractProductPage($, request) {
    // init some variables to support eval
    const isDesktop = true;
    const [osaArea, osaType, virtualCategory] = Array(3).fill(undefined);
    const [getTouchpoint, utagTealiumTrack] = Array(2).fill(() => undefined);

    // get productData
    const scriptContent = $('script:contains("var productArticleDetails")').html();
    const start = scriptContent.indexOf('var productArticleDetails = '); // + 28
    const end = scriptContent.length;
    const dataString = scriptContent.substr(start, end);
    dataString.trim();
    eval(dataString); // create productArticleDetails variable
    const productData = productArticleDetails;

    // get utagData // INVECE CHE UTAG, potrei prendere category in extractSubcatPage e passarlo come userData
    const scriptContent2 = $('script:contains("utag_data = ")').html();
    const start2 = scriptContent2.indexOf('utag_data = ');
    let dataString2 = scriptContent2.substr(start2);
    const end2 = dataString2.indexOf('};') + 2;
    dataString2 = dataString2.substr(0, end);
    eval(dataString2); // create utag_data
    const utagData = utag_data;

    // get schema.org data
    const schemaObject = JSON.parse($($('script[type="application/ld+json"]')[0]).text().trim());

    const itemId = request.url.match(/[0-9]{8,12}/)[0];

    // get code for group of products (all colors)
    const groupCode = productData.productKey.split('_')[0];

    // keep only current product
    const product = productData[itemId];

    // get availability list
    const { body } = await requestAsBrowser({
        url: `https://www2.hm.com/hmwebservices/service/product/us/availability/${groupCode}.json`,
        abortFunction: false,
    });
    const parsedBody = JSON.parse(body);
    const availability = parsedBody.availability.concat(parsedBody.fewPieceLeft);

    const items = [];

    // create item
    const item = Object.create(null);

    item.source = 'hm';
    item.itemId = itemId;
    item.url = request.url;
    item.scrapedAt = new Date().toISOString();
    item.brand = schemaObject.brand.name.replace(/&amp;/g, '&');
    item.title = schemaObject.name;
    item.categories = utagData.product_category[0].split('_').map(s => s.toLowerCase());
    item.description = product.description;
    item.composition = product.compositions.join(', '); // ? null
    item.price = product.promoMarkerLegalText ? product.promoMarkerLegalText : product.promoMarkerLabelText;
    item.salePrice = product.promoMarkerLabelText;
    item.currency = schemaObject.offers[0].priceCurrency;
    item.color = product.name;
    item.sizes = product.sizes.map(size => size.name).filter(name => name !== '');
    item.availableSizes = product.sizes.filter(size => availability.includes(size.sizeCode)).map(size => size.name);
    item.images = product.images.map((o) => { return { url: `https:${o.image}` }; });

    return item;
}

//

module.exports = {
    enqueueMainCategories,
    enqueueSubcategories,
    extractSubcatPage,
    extractProductPage,
};
