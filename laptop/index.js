  const LaptopGrpcClient = require('./client.cjs').default || require('./client.cjs');
  
  const client = new LaptopGrpcClient({
    serverUrl: process.env.SERVER_URL || 'https://racermagenta-g8jcvu--79167.stormkit.dev/',
    localAppUrl: process.env.LOCAL_APP_URL || 'http://localhost:8100'
  });
  
  client.connect().catch(console.error);
  
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    client.disconnect();
    process.exit(0);
  });
});
