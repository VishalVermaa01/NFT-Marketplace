import { useState, useEffect } from 'react';
import { ethers } from "ethers";
import { Row, Col, Card, Button, Spinner } from 'react-bootstrap';

// Add delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const Home = ({ marketplace, nft }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  const fetchMetadataWithRetry = async (uri, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Fetching metadata from: ${uri} (attempt ${i + 1})`);
        
        const response = await fetch(uri);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const metadata = await response.json();
        
        // Validate metadata structure
        if (!metadata.name && !metadata.description && !metadata.image) {
          throw new Error('Invalid metadata structure');
        }
        
        return metadata;
        
      } catch (error) {
        console.warn(`Metadata fetch attempt ${i + 1} failed:`, error.message);
        
        if (i === retries - 1) {
          // Last attempt failed, return default metadata
          console.error(`Failed to fetch metadata after ${retries} attempts:`, error);
          return {
            name: 'Unknown NFT',
            description: 'Metadata could not be loaded',
            image: 'https://via.placeholder.com/400x400?text=Image+Not+Available'
          };
        }
        
        // Wait before retry to avoid rate limiting
        await delay(1000 * (i + 1)); // Exponential backoff
      }
    }
  };

  const loadMarketplaceItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading marketplace items...');
      
      // Get the total number of items listed on the marketplace
      const itemCount = await marketplace.itemCount();
      console.log(`Total items in marketplace: ${itemCount}`);
      
      let items = [];

      // Iterate through each item
      for (let i = 1; i <= itemCount; i++) {
        try {
          const item = await marketplace.items(i);
          console.log(`Processing item ${i}:`, item);

          // Only process items that are not yet sold
          if (!item.sold) {
            // Get the token URI from the NFT contract
            const uri = await nft.tokenURI(item.tokenId);
            console.log(`Token URI for item ${i}:`, uri);
            
            // Add delay to avoid rate limiting
            await delay(500);
            
            // Fetch the metadata from the token URI with retry logic
            const metadata = await fetchMetadataWithRetry(uri);
            
            // Get the total price of the item (item price + seller fee)
            const totalPrice = await marketplace.getTotalPrice(item.itemId);

            // Add the item to our list
            items.push({
              totalPrice,
              itemId: item.itemId,
              seller: item.seller,
              tokenId: item.tokenId,
              name: metadata.name || 'Unknown NFT',
              description: metadata.description || 'No description available',
              image: metadata.image || 'https://via.placeholder.com/400x400?text=Image+Not+Available'
            });
          }
        } catch (itemError) {
          console.error(`Error processing item ${i}:`, itemError);
          // Continue with other items instead of failing completely
        }
      }
      
      console.log('Loaded items:', items);
      setItems(items);
      
    } catch (error) {
      console.error('Error loading marketplace items:', error);
      setError(`Failed to load marketplace items: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buyMarketItem = async (item) => {
    try {
      console.log('Purchasing item:', item);
      
      const tx = await marketplace.purchaseItem(item.itemId, { 
        value: item.totalPrice 
      });
      
      console.log('Purchase transaction:', tx);
      await tx.wait();
      
      console.log('Purchase completed successfully');
      
      // After buying, reload the items to reflect the change
      await loadMarketplaceItems();
      
    } catch (error) {
      console.error('Error purchasing item:', error);
      setError(`Failed to purchase item: ${error.message}`);
    }
  };

  useEffect(() => {
    if (marketplace && nft) {
      loadMarketplaceItems();
    }
  }, [marketplace, nft]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner animation="border" style={{ display: 'flex' }} />
      <p className='mx-3 my-0'>Loading Marketplace...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="text-center">
        <div className="alert alert-danger" role="alert">
          <h4>Error</h4>
          <p>{error}</p>
          <Button variant="outline-danger" onClick={loadMarketplaceItems}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex justify-center">
      {items.length > 0 ? (
        <div className="px-5 container">
          <Row xs={1} md={2} lg={4} className="g-4 py-5">
            {items.map((item, idx) => (
              <Col key={`${item.itemId}-${idx}`} className="overflow-hidden">
                <Card>
                  <Card.Img 
                    variant="top" 
                    src={item.image} 
                    onError={(e) => {
                      console.warn('Image failed to load:', item.image);
                      e.target.src = 'https://via.placeholder.com/400x400?text=Image+Not+Available';
                    }}
                    style={{ height: '250px', objectFit: 'cover' }}
                  />
                  <Card.Body color="secondary">
                    <Card.Title>{item.name}</Card.Title>
                    <Card.Text>{item.description}</Card.Text>
                    <small className="text-muted">
                      Token ID: {item.tokenId?.toString()}
                    </small>
                  </Card.Body>
                  <Card.Footer>
                    <div className='d-grid'>
                      <Button 
                        onClick={() => buyMarketItem(item)} 
                        variant="primary" 
                        size="lg"
                      >
                        Buy for {ethers.utils.formatEther(item.totalPrice)} ETH
                      </Button>
                    </div>
                  </Card.Footer>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ) : (
        <main style={{ padding: "1rem 0" }}>
          <div className="text-center">
            <h2>No listed assets</h2>
            <p>Be the first to list an NFT on this marketplace!</p>
          </div>
        </main>
      )}
    </div>
  );
};

export default Home;