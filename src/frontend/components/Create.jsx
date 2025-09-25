import { useState } from 'react'
import { ethers } from "ethers"
import { Row, Form, Button } from 'react-bootstrap'

// Pinata API endpoint
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_API_KEY = import.meta.env.VITE_PINATA_SECRET_API_KEY;
const PINATA_BASE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// Add delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const Create = ({ marketplace, nft }) => {
  const [image, setImage] = useState('')
  const [price, setPrice] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const uploadToIPFS = async (event) => {
    event.preventDefault();
    const file = event.target.files[0];
    
    if (typeof file !== 'undefined') {
      setLoading(true);
      setStatus('Uploading image to IPFS...');
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        // Add metadata for better organization
        const metadata = JSON.stringify({
          name: `NFT_Image_${Date.now()}`,
          description: 'NFT Marketplace Image'
        });
        formData.append('pinataMetadata', metadata);

        const res = await fetch(PINATA_BASE_URL, {
          method: 'POST',
          headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY
          },
          body: formData
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        
        if (!data.IpfsHash) {
          throw new Error('No IpfsHash returned from Pinata');
        }

        const imageUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
        setImage(imageUrl);
        setStatus('Image uploaded successfully!');
        
        // Add delay to avoid rate limiting
        await delay(1000);
        
      } catch (error) {
        console.error("Pinata IPFS image upload error: ", error);
        setStatus(`Image upload error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  }

  const createNFT = async () => {
    if (!image || !price || !name || !description) {
      setStatus('Please fill all fields and upload an image.');
      return;
    }

    setLoading(true);
    setStatus('Creating NFT...');

    try {
      // Create metadata object
      const metadata = {
        image,
        name,
        description,
        price: price.toString(),
        attributes: [
          {
            trait_type: "Created",
            value: new Date().toISOString()
          }
        ]
      };

      // Convert metadata to blob
      const metadataBlob = new Blob([JSON.stringify(metadata)], { 
        type: 'application/json' 
      });
      
      const formData = new FormData();
      formData.append('file', metadataBlob, `metadata_${Date.now()}.json`);
      
      // Add metadata for organization
      const pinataMetadata = JSON.stringify({
        name: `NFT_Metadata_${name}_${Date.now()}`,
        description: `Metadata for NFT: ${name}`
      });
      formData.append('pinataMetadata', pinataMetadata);

      setStatus('Uploading metadata to IPFS...');

      const res = await fetch(PINATA_BASE_URL, {
        method: 'POST',
        headers: {
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET_API_KEY
        },
        body: formData
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Metadata upload failed: HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      
      if (!data.IpfsHash) {
        throw new Error('No IpfsHash returned for metadata');
      }

      setStatus('Metadata uploaded! Minting NFT...');
      console.log('Metadata uploaded to:', `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`);

      // Add delay before minting
      await delay(2000);

      // Verify metadata before minting
      try {
        const metadataUrl = `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
        const metaRes = await fetch(metadataUrl);
        
        if (!metaRes.ok) {
          console.warn('Could not fetch metadata immediately, but proceeding with mint...');
        } else {
          const metaJson = await metaRes.json();
          console.log('Verified metadata from IPFS:', metaJson);
        }
      } catch (metaErr) {
        console.warn('Metadata verification failed, but proceeding with mint:', metaErr);
      }

      // Proceed with minting
      await mintThenList({ path: data.IpfsHash });
      setStatus('NFT minted and listed successfully!');
      
      // Reset form
      setImage('');
      setName('');
      setDescription('');
      setPrice('');
      
    } catch (error) {
      console.error("NFT creation error: ", error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  const mintThenList = async (result) => {
    try {
      const uri = `https://gateway.pinata.cloud/ipfs/${result.path}`;
      console.log('Minting NFT with URI:', uri);
      
      setStatus('Minting NFT...');
      
      // Mint the NFT
      const transaction = await nft.mint(uri);
      const receipt = await transaction.wait();

      console.log('Mint transaction receipt:', receipt);

      // Get the tokenId from the Transfer event
      const transferEvent = receipt.events?.find(e => e.event === 'Transfer');
      
      if (!transferEvent || !transferEvent.args) {
        throw new Error("Minting failed: No Transfer event found in receipt");
      }

      const id = transferEvent.args.tokenId;
      console.log('Minted NFT with tokenId:', id.toString());

      setStatus('Approving marketplace...');

      // Approve marketplace to spend NFT
      const approvalTx = await nft.setApprovalForAll(marketplace.address, true);
      await approvalTx.wait();

      setStatus('Listing NFT on marketplace...');

      // Add NFT to marketplace
      const listingPrice = ethers.utils.parseEther(price.toString());
      const listTx = await marketplace.makeItem(nft.address, id, listingPrice);
      await listTx.wait();

      console.log('NFT listed successfully');
      
    } catch (error) {
      console.error('Mint and list error:', error);
      throw new Error(`Failed to mint and list NFT: ${error.message}`);
    }
  }

  return (
    <div className="container-fluid mt-5">
      <div className="row">
        <main role="main" className="col-lg-12 mx-auto" style={{ maxWidth: '1000px' }}>
          <div className="content mx-auto">
            <Row className="g-4">
              <Form.Control
                type="file"
                required
                name="file"
                onChange={uploadToIPFS}
                accept="image/*"
                disabled={loading}
              />
              <Form.Control 
                onChange={(e) => setName(e.target.value)} 
                size="lg" 
                required 
                type="text" 
                placeholder="Name"
                value={name}
                disabled={loading}
              />
              <Form.Control 
                onChange={(e) => setDescription(e.target.value)} 
                size="lg" 
                required 
                as="textarea" 
                placeholder="Description"
                value={description}
                disabled={loading}
              />
              <Form.Control 
                onChange={(e) => setPrice(e.target.value)} 
                size="lg" 
                required 
                type="number" 
                placeholder="Price in ETH"
                value={price || ''}
                min="0"
                step="0.001"
                disabled={loading}
              />
              <div className="d-grid px-0">
                <Button 
                  onClick={createNFT} 
                  variant="primary" 
                  size="lg"
                  disabled={loading || !image}
                >
                  {loading ? 'Processing...' : 'Create & List NFT!'}
                </Button>
              </div>
              {status && (
                <div className={`mt-3 alert ${status.includes('error') || status.includes('Error') ? 'alert-danger' : 'alert-info'}`} role="alert">
                  {status}
                </div>
              )}
              {image && (
                <div className="mt-3">
                  <img src={image} alt="Preview" style={{ maxWidth: '200px', height: 'auto' }} />
                </div>
              )}
            </Row>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Create;