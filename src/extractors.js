const Apify = require('apify');
const { log } = Apify.utils;

const { BASE_URL } = require('./constants');

const {
    constructApiUrl,
    getTotalNumOfProds,
    getAllProductsByChunks,
    getProductData,
    getUtagData,
    getAvailabilityList
} = require('./helpers');


async function enqueueMainCategories($, requestQueue) {
    const menuAnchors = $('ul.menu__primary').find('a.menu__super-link').toArray();

    for (const anchor of menuAnchors) {
        const info = await requestQueue.addRequest({
            url: BASE_URL + $(anchor).attr('href'),
            userData: { label: 'MAINCAT' }
        });
        console.log(info.request.url);
    }

    return menuAnchors.length;
}

async function enqueueSubcategories($, requestQueue) {
    const viewAllAnchor = $('#menu-links').find('a:contains("View All")');

    // standard main-cat, "View All" is just one
    if (viewAllAnchor.length === 1) {
        const info = await requestQueue.addRequest({
            url: BASE_URL + viewAllAnchor.attr('href'),
            forefront: true,
            userData: { label: 'SUBCAT' }
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
                userData: { label: 'SUBCAT' }
            });
        }

        return `${anchors.length} subcategories`;
    }

}

async function extractSubcatPage($, request, proxyUrls) {
    const dataCategory = $('article[data-category]')[0].attribs['data-category'];
    // const productType = dataCategory.split('_').slice(0, 2).join('_');

    const productType = $('input[data-name="product-type"][checked]')[0]
        ? $('input[data-name="product-type"][checked]')[0].attribs.value
        : dataCategory.split('_').slice(0, 2).join('_');

    const dataProductsUrl = $('form[data-filtered-products-url]')[0].attribs['data-filtered-products-url'];

    const isViewAll = request.url.includes('view-all');

    // construct apiUrl
    const apiUrl = constructApiUrl(isViewAll, dataProductsUrl, productType);

    // get total
    const total = await getTotalNumOfProds(apiUrl, isViewAll, proxyUrls);
    console.log(request.url, 'total', total);

    // get all products by chunks
    const data = await getAllProductsByChunks(total, apiUrl, isViewAll, proxyUrls);
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

async function extractProductPage($, request) {
    // get productData
    const productData = getProductData($);
    // get utagData // INVECE CHE UTAG, potrei prendere category in extractSubcatPage e passarlo come userData
    const utagData = getUtagData($);
    // get schema.org data
    const schemaObject = JSON.parse($($('script[type="application/ld+json"]')[0]).text().trim());

    const itemId = request.url.match(/[0-9]{8,12}/)[0];

    // get code for group of products (all colors)
    const groupCode = productData.productKey.split('_')[0];

    // keep only current product
    const product = productData[itemId];

    // get availability list
    const availability = await getAvailabilityList(groupCode);

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

module.exports = {
    enqueueMainCategories,
    enqueueSubcategories,
    extractSubcatPage,
    extractProductPage,
};
