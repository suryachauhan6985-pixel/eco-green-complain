const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { id: 1, username: 'admin', role: 'admin' },
  'ecogreen_solar_cms_secret_key_2026'
);

const BASE = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev';

async function testCatalog() {
  console.log('Testing Live Cloudflare Worker Catalog APIs...');

  // 1. Add Product
  const prodPayload = {
    name: 'Automated Test Product 99',
    description: 'Test product created for verification'
  };
  const addProdRes = await fetch(BASE + '/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(prodPayload)
  });
  const addProdData = await addProdRes.json();
  console.log('1. Add Product response status:', addProdRes.status);
  console.log('   Data:', addProdData);

  if (addProdRes.status !== 201 || !addProdData.product?.id) {
    throw new Error('Failed to create product');
  }
  const prodId = addProdData.product.id;

  // 2. Fetch Products
  const getProdRes = await fetch(BASE + '/api/products');
  const getProdData = await getProdRes.json();
  console.log('2. Fetch Products count:', getProdData.products?.length);
  const foundProd = getProdData.products?.find(p => String(p.id) === String(prodId));
  if (!foundProd) throw new Error('Created product not found in products list');
  console.log('   Found product in catalog:', foundProd.name);

  // 3. Delete Product
  const delProdRes = await fetch(BASE + '/api/products/' + prodId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const delProdData = await delProdRes.json();
  console.log('3. Delete Product status:', delProdRes.status, delProdData);
  if (delProdRes.status !== 200 || !delProdData.success) {
    throw new Error('Failed to delete product');
  }

  // 4. Add Category
  const catPayload = {
    product_type: 'Solar Rooftop Systems',
    category_name: 'Automated Test Category 99'
  };
  const addCatRes = await fetch(BASE + '/api/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(catPayload)
  });
  const addCatData = await addCatRes.json();
  console.log('4. Add Category response status:', addCatRes.status);
  console.log('   Data:', addCatData);

  if (addCatRes.status !== 201 || !addCatData.category?.id) {
    throw new Error('Failed to create category');
  }
  const catId = addCatData.category.id;

  // 5. Fetch Categories
  const getCatRes = await fetch(BASE + '/api/categories?product_type=Solar%20Rooftop%20Systems');
  const getCatData = await getCatRes.json();
  console.log('5. Fetch Categories for Solar Rooftop Systems count:', getCatData.categories?.length);
  const foundCat = getCatData.categories?.find(c => String(c.id) === String(catId));
  if (!foundCat) throw new Error('Created category not found in categories list');
  console.log('   Found category:', foundCat.category_name);

  // 6. Delete Category
  const delCatRes = await fetch(BASE + '/api/categories/' + catId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const delCatData = await delCatRes.json();
  console.log('6. Delete Category status:', delCatRes.status, delCatData);
  if (delCatRes.status !== 200 || !delCatData.success) {
    throw new Error('Failed to delete category');
  }

  console.log('\n============================================================');
  console.log('ALL CLOUDFLARE WORKER CATALOG & CATEGORY APIS WORKING 100%!');
  console.log('============================================================');
}

testCatalog().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
