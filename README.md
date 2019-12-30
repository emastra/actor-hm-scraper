## H&M Scraper

H&M Scraper is an [Apify actor](https://apify.com/actors) for extracting product data from [hm.com](https://www.hm.com/) fashion on line store. It allows you to scrape the whole site, specific categories and products. It is build on top of [Apify SDK](https://sdk.apify.com/) and you can run it both on [Apify platform](https://my.apify.com) and locally.

- [Input](#input)
- [Output](#output)
- [Compute units consumption](#compute-units-consumption)
- [Extend output function](#extend-output-function)

### Input

| Field | Type | Description |
| ----- | ---- | ----------- |
| startUrls | array | (required) List of [Request](https://sdk.apify.com/docs/api/request#docsNav) objects that will be deeply crawled. The URLs can be the home page `https://www2.hm.com/en_us/index.html` or a combination of top-level categories, sub-categories and product page URLs |
| maxItems | number | (optional) Maximum number of product items to be scraped |
| extendOutputFunction | string | (optional) Function that takes a JQuery handle ($) as argument and returns data that will be merged with the default output. More information in [Extend output function](#extend-output-function) |
| proxyConfiguration | object | (optional) Proxy settings of the run. If you have access to Apify proxy, leave the default settings. If not, you can set `{ "useApifyProxy": false" }` to disable proxy usage |

**Notes on the input**
- When `maxItems` is set, the total results may be slightly greater. This is because the actor waits for pending requests to complete and because each product on the website may produce more than one item (derived from every color variants of the products).

INPUT Example:

```
{
  "startUrls": [
    { "url": "https://www2.hm.com/content/hmonline/en_us/women/products/dresses.html/" },
    { "url": "https://www2.hm.com/en_us/divided/new-arrivals/clothes.html" },
    { "url": "https://www2.hm.com/en_us/productpage.0850395001.html" }
  ],
  "maxItems": 1000,
  "extendOutputFunction": "($) => { return { test: 1234, test2: 5678 } }",
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

### Output

Output is stored in a dataset. Each item is information about one product. Each color variant has a different product ID and produces a different item.

Example of one item output:

```
{
  "source": "hm",
  "itemId": "0448509001",
  "url": "https://www2.hm.com/en_us/productpage.0448509001.html",
  "scrapedAt": "2019-12-30T09:44:01.434Z",
  "brand": "H&M",
  "title": "Slim Mom Jeans",
  "categories": [
    "ladies",
    "jeans",
    "slim"
  ],
  "description": "5-pocket, ankle-length jeans in washed denim with a high waist. Slim legs with frayed, cut-off hems.",
  "composition": "Cotton 100%",
  "price": 29.99,
  "salePrice": 29.99,
  "currency": "USD",
  "color": "Black denim",
  "sizes": [
    "0",
    "2",
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "16",
    "18",
    "10P",
    "12P"
  ],
  "availableSizes": [
    "0",
    "2",
    "4",
    "6",
    "8",
    "10",
    "12",
    "14",
    "10P",
    "12P"
  ],
  "images": [
    {
      "url": "https://lp2.hm.com/hmgoepprod?set=source[/4f/c8/4fc85043dc0e4345797e827c4b572d57588412f6.jpg],origin[dam],category[ladies_jeans_slim],type[LOOKBOOK],res[m],hmver[1]&call=url[file:/product/main]"
    },
    {
      "url": "https://lp2.hm.com/hmgoepprod?set=source[/68/26/6826021d6271a28ac56041ea3e52109edf3f5b71.jpg],origin[dam],category[ladies_jeans_slim],type[LOOKBOOK],res[m],hmver[1]&call=url[file:/product/main]"
    },
    {
      "url": "https://lp2.hm.com/hmgoepprod?set=source[/ab/8c/ab8c393cc08603819a8532d3c4238ccaeafea7d1.jpg],origin[dam],category[ladies_jeans_slim],type[LOOKBOOK],res[m],hmver[1]&call=url[file:/product/main]"
    },
    {
      "url": "https://lp2.hm.com/hmgoepprod?set=source[/4a/38/4a3895532142d636c187e5a9a74480b767425ae7.jpg],origin[dam],category[ladies_jeans_slim],type[DESCRIPTIVESTILLLIFE],res[m],hmver[1]&call=url[file:/product/main]"
    },
    {
      "url": "https://lp2.hm.com/hmgoepprod?set=source[/75/a3/75a326a150146d0533fe1b0b59cbaee246675bdd.jpg],origin[dam],category[ladies_jeans_slim],type[DESCRIPTIVEDETAIL],res[m],hmver[1]&call=url[file:/product/main]"
    }
  ]
}
```

### Compute units consumption
The actor uses [CheerioCrawler](https://sdk.apify.com/docs/api/cheeriocrawler) which has low consumption.

With 4096MB of RAM set for the actor, expected compute units per **1000** scraped pages: **0.3199**

Keep in mind that it is much more efficient to run one longer scrape (at least one minute) than more shorter ones because of the startup time.

### Extend output function

You can use this function to update the default output of this actor. This function gets a JQuery handle `$` as an argument so you can choose what data from the page you want to scrape. The output from this will function will get merged with the default output.

The **return value** of this function has to be an **object**!

You can return fields to achieve 3 different things:
- Add a new field - Return object with a field that is not in the default output
- Change a field - Return an existing field with a new value
- Remove a field - Return an existing field with a value `undefined`

The following example will change the `title` field, remove the `composition` field and add a new field:
```
($) => {
    return {
        title: 'This is a new title',
        composition: undefined,
        myNewField: 1234
    }
}
```

### Open an issue
If you find any bug, please create an issue on the actor [Github page](https://github.com/emastra/actor-hm-scraper).
