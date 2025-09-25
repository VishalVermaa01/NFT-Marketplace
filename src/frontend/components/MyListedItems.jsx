import { useState, useEffect } from 'react'
import { ethers } from "ethers"
import { Row, Col, Card, Spinner } from 'react-bootstrap'

// Add delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchMetadataWithRetry = async (uri, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching metadata from: ${uri} (attempt ${i + 1})`);
      
      if (!uri || uri === 'undefined' || uri.includes('undefined')) {
        throw new Error('Invalid URI provided');
      }
      
      const response = await fetch(uri);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
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

function renderSoldItems(items) {
  return (
    <>
      <h2>Sold</h2>
      <Row xs={1} md={2} lg={4} className="g-4 py-3">
        {items.map((item, idx) => (
          <Col key={`sold-${idx}`} className="overflow-hidden">
            <Card>
              <Card.Img 
                variant="top" 
                src={item.image}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x400?text=Image+Not+Available';
                }}
                style={{ height: '250px', objectFit: 'cover' }}
              />
              <Card.Body>
                <Card.Title>{item.name}</Card.Title>
                <Card.Text>{item.description}</Card.Text>
              </Card.Body>
              <Card.Footer>
                For {ethers.utils.formatEther(item.totalPrice)} ETH - Received {ethers.utils.formatEther(item.price)} ETH
              </Card.Footer>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  )
}

export default function MyListedItems({ marketplace, nft, account }) {
  const [loading, setLoading] = useState(true)
  const [listedItems, setListedItems] = useState([])
  const [soldItems, setSoldItems] = useState([])
  const [error, setError] = useState(null)

  const loadListedItems = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('Loading listed items for account:', account);
      
      if (!account || !marketplace || !nft) {
        throw new Error('Missing required parameters: account, marketplace, or nft contract');
      }

      // Load all items that the user listed
      const itemCount = await marketplace.itemCount()
      console.log(`Total items in marketplace: ${itemCount}`);
      
      let listedItems = []
      let soldItems = []
      
      for (let indx = 1; indx <= itemCount; indx++) {
        try {
          const i = await marketplace.items(indx)
          console.log(`Item ${indx}:`, {
            seller: i.seller,
            account: account,
            tokenId: i.tokenId?.toString(),
            sold: i.sold
          });
          
          // Check if the current account is the seller (case insensitive)
          if (i.seller.toLowerCase() === account.toLowerCase()) {
            console.log(`Processing item ${indx} owned by user`);
            
            // Get uri url from nft contract
            let uri;
            try {
              uri = await nft.tokenURI(i.tokenId);
              console.log(`Token URI for item ${indx}:`, uri);
              
              if (!uri || uri === 'undefined' || uri.includes('undefined')) {
                throw new Error(`Invalid or undefined URI for tokenId ${i.tokenId}`);
              }
              
            } catch (uriError) {
              console.error(`Error getting tokenURI for tokenId ${i.tokenId}:`, uriError);
              continue; // Skip this item and continue with others
            }
            
            // Add delay to avoid rate limiting
            await delay(500);
            
            // Use uri to fetch the nft metadata stored on ipfs with retry logic
            const metadata = await fetchMetadataWithRetry(uri);
            
            // Get total price of item (item price + fee)
            const totalPrice = await marketplace.getTotalPrice(i.itemId)
            
            // Define listed item object
            let item = {
              totalPrice,
              price: i.price,
              itemId: i.itemId,
              tokenId: i.tokenId,
              name: metadata.name || 'Unknown NFT',
              description: metadata.description || 'No description available',
              image: metadata.image || 'https://via.placeholder.com/400x400?text=Image+Not+Available'
            }
            
            listedItems.push(item)
            
            // Add listed item to sold items array if sold
            if (i.sold) {
              soldItems.push(item)
            }
          }
        } catch (itemError) {
          console.error(`Error processing item ${indx}:`, itemError);
          // Continue with other items instead of failing completely
        }
      }
      
      console.log('Loaded listed items:', listedItems);
      console.log('Loaded sold items:', soldItems);
      
      setListedItems(listedItems)
      setSoldItems(soldItems)
      
    } catch (error) {
      console.error('Error loading listed items:', error);
      setError(`Failed to load your listed items: ${error.message}`);
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (marketplace && nft && account) {
      loadListedItems()
    }
  }, [marketplace, nft, account])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner animation="border" style={{ display: 'flex' }} />
      <p className='mx-3 my-0'>Loading your listed items...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="text-center">
        <div className="alert alert-danger" role="alert">
          <h4>Error</h4>
          <p>{error}</p>
          <button className="btn btn-outline-danger" onClick={loadListedItems}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex justify-center">
      {listedItems.length > 0 ? (
        <div className="px-5 py-3 container">
          <h2>Listed</h2>
          <Row xs={1} md={2} lg={4} className="g-4 py-3">
            {listedItems.map((item, idx) => (
              <Col key={`listed-${item.itemId}-${idx}`} className="overflow-hidden">
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
                  <Card.Body>
                    <Card.Title>{item.name}</Card.Title>
                    <Card.Text>{item.description}</Card.Text>
                    <small className="text-muted">
                      Token ID: {item.tokenId?.toString()}
                    </small>
                  </Card.Body>
                  <Card.Footer>
                    {ethers.utils.formatEther(item.totalPrice)} ETH
                  </Card.Footer>
                </Card>
              </Col>
            ))}
          </Row>
          {soldItems.length > 0 && renderSoldItems(soldItems)}
        </div>
      ) : (
        <main style={{ padding: "1rem 0" }}>
          <div className="text-center">
            <h2>No listed assets</h2>
            <p>You haven't listed any NFTs yet.</p>
          </div>
        </main>
      )}
    </div>
  );
}