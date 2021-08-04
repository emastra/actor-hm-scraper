const Apify = require('apify');
const { BASE_URL } = require('./constants');

const { log } = Apify.utils;

const {
    constructApiUrl,
    getTotalNumOfProds,
    getAllProductsByChunks,
    getProductData,
    getUtagData,
    getAvailabilityList,
} = require('./helpers');

async function enqueueMainCategories($, requestQueue) {
    const menuAnchors = $('ul.menu__primary').find('a.menu__super-link').toArray();

    for (const anchor of menuAnchors) {
        const info = await requestQueue.addRequest({
            url: BASE_URL + $(anchor).attr('href'),
            userData: { label: 'MAINCAT' },
        });
        log.info(info.request.url);
    }

    return menuAnchors.length;
}

async function enqueueSubcategories($, requestQueue) {
    const viewAllAnchor = $('#menu-links').find('a[role="menuitem"]').toArray()
        .filter((a) => $(a).text().trim().toLowerCase() === 'view all');

    // standard main-cat, "View All" is just one
    if (viewAllAnchor.length === 1) {
        await requestQueue.addRequest({
            url: BASE_URL + $(viewAllAnchor[0]).attr('href'),
            userData: { label: 'SUBCAT' },
        });
    } else {
        const anchors = viewAllAnchor;

        for (const anchor of anchors) {
            await requestQueue.addRequest({
                url: BASE_URL + $(anchor).attr('href'),
                userData: { label: 'SUBCAT' },
            });
        }
    }
}

async function extractSubcatPage($, request, proxyUrls) {
    const dataCategory = $('article[data-category]')[0].attribs['data-category'];

    const productType = $('input[data-name="product-type"][checked]')[0]
        ? $('input[data-name="product-type"][checked]')[0].attribs.value
        : dataCategory.split('_').slice(0, 2).join('_');

    const dataProductsUrl = $('form[data-filtered-products-url]')[0].attribs['data-filtered-products-url'];

    const isViewAll = request.url.includes('view-all');

    // construct apiUrl
    const apiUrl = constructApiUrl(isViewAll, dataProductsUrl, productType);

    // get total
    const total = await getTotalNumOfProds(apiUrl, isViewAll, proxyUrls);

    // get all products by chunks
    const products = await getAllProductsByChunks(total, apiUrl, isViewAll, proxyUrls);

    const productInfo = [];

    for (const product of products) {
        const { category, swatches } = product;

        for (const swatch of swatches) {
            productInfo.push({ link: swatch.articleLink, category });
        }
    }

    return productInfo;
}

async function extractProductPage($, request, proxyUrls, category = null) {
    // get productData
    const productData = getProductData($);
    const schemaObject = JSON.parse($($('script[type="application/ld+json"]')[0]).html().trim());
    // get utagData
    let utagData;
    if (!category) {
        utagData = getUtagData($);
    }

    const itemId = request.url.match(/[0-9]{8,12}/)[0];

    // get code for group of products (all colors)
    const groupCode = productData.productKey.split('_')[0];

    // keep only current product
    const product = productData[itemId];

    // get availability list
    const availability = await getAvailabilityList(groupCode, proxyUrls);

    // create item
    const item = Object.create(null);

    item.source = 'hm';
    item.itemId = itemId;
    item.url = request.url;
    item.scrapedAt = new Date().toISOString();
    item.brand = schemaObject.brand.name.replace(/&amp;/g, '&');
    item.title = schemaObject.name;
    item.categories = category
        ? category.split('_').map((s) => s.toLowerCase())
        : utagData.product_category[0].split('_').map((s) => s.toLowerCase());
    item.description = product.description;
    item.composition = product.compositions ? product.compositions.join(', ') : null;
    item.price = product.whitePriceValue ? Number(product.whitePriceValue) : Number(product.promoMarkerLabelText.replace('$', ''));
    item.salePrice = product.redPriceValue ? Number(product.redPriceValue) : item.price;
    item.currency = schemaObject.offers[0].priceCurrency;
    item.color = product.name;
    item.sizes = product.sizes.map((size) => size.name).filter((name) => name !== '');
    item.availableSizes = product.sizes.filter((size) => availability.includes(size.sizeCode)).map((size) => size.name);
    item.images = product.images.map((o) => { return { url: `https:${o.image}` }; });

    return item;
}

module.exports = {
    enqueueMainCategories,
    enqueueSubcategories,
    extractSubcatPage,
    extractProductPage,
};
