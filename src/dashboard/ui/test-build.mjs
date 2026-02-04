import { rollup } from 'rollup';
import { resolve } from 'path';

async function test() {
  const bundle = await rollup({
    input: resolve('./src/App.tsx'),
    external: ['react', 'react-dom', 'react-router-dom']
  });
  console.log('Build successful');
}

test().catch(e => console.error('Error:', e.message));
