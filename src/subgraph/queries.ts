export const SUBGRAPH_INTROSPECTION_QUERY = `
query {
  __schema {
    queryType {
      fields {
        name
      }
    }
  }
}
`.trim();

export const BAAZAAR_ERC721_LISTING_BY_ID_QUERY = `
query($id: ID!) {
  erc721Listing(id: $id) {
    id
    category
    erc721TokenAddress
    tokenId
    seller
    priceInWei
    cancelled
    timeCreated
    timePurchased
  }
}
`.trim();

export const BAAZAAR_ERC1155_LISTING_BY_ID_QUERY = `
query($id: ID!) {
  erc1155Listing(id: $id) {
    id
    category
    erc1155TokenAddress
    erc1155TypeId
    quantity
    seller
    priceInWei
    cancelled
    sold
    timeCreated
  }
}
`.trim();

export const BAAZAAR_ACTIVE_ERC721_QUERY = `
query($first: Int!, $skip: Int!) {
  erc721Listings(
    first: $first
    skip: $skip
    orderBy: timeCreated
    orderDirection: desc
    where: { cancelled: false, timePurchased: "0" }
  ) {
    id
    category
    erc721TokenAddress
    tokenId
    seller
    priceInWei
    cancelled
    timeCreated
    timePurchased
  }
}
`.trim();

export const BAAZAAR_ACTIVE_ERC1155_QUERY = `
query($first: Int!, $skip: Int!) {
  erc1155Listings(
    first: $first
    skip: $skip
    orderBy: timeCreated
    orderDirection: desc
    where: { cancelled: false, sold: false }
  ) {
    id
    category
    erc1155TokenAddress
    erc1155TypeId
    quantity
    seller
    priceInWei
    cancelled
    sold
    timeCreated
  }
}
`.trim();

export const BAAZAAR_MINE_ERC721_QUERY = `
query($seller: Bytes!, $first: Int!, $skip: Int!) {
  erc721Listings(
    first: $first
    skip: $skip
    orderBy: timeCreated
    orderDirection: desc
    where: { seller: $seller }
  ) {
    id
    category
    erc721TokenAddress
    tokenId
    seller
    priceInWei
    cancelled
    timeCreated
    timePurchased
  }
}
`.trim();

export const BAAZAAR_MINE_ERC1155_QUERY = `
query($seller: Bytes!, $first: Int!, $skip: Int!) {
  erc1155Listings(
    first: $first
    skip: $skip
    orderBy: timeCreated
    orderDirection: desc
    where: { seller: $seller }
  ) {
    id
    category
    erc1155TokenAddress
    erc1155TypeId
    quantity
    seller
    priceInWei
    cancelled
    sold
    timeCreated
  }
}
`.trim();

export const GBM_AUCTION_BY_ID_QUERY = `
query($id: ID!) {
  auction(id: $id) {
    id
    type
    contractAddress
    tokenId
    quantity
    seller
    highestBid
    highestBidder
    totalBids
    startsAt
    endsAt
    claimAt
    claimed
    cancelled
    presetId
    category
    buyNowPrice
    startBidPrice
  }
}
`.trim();

export const GBM_ACTIVE_AUCTIONS_QUERY = `
query($now: BigInt!, $first: Int!, $skip: Int!) {
  auctions(
    first: $first
    skip: $skip
    orderBy: endsAt
    orderDirection: asc
    where: { claimed: false, cancelled: false, startsAt_lte: $now, endsAt_gt: $now }
  ) {
    id
    type
    contractAddress
    tokenId
    quantity
    seller
    highestBid
    highestBidder
    totalBids
    startsAt
    endsAt
    claimAt
    claimed
    cancelled
    presetId
    category
    buyNowPrice
    startBidPrice
  }
}
`.trim();

export const GBM_MINE_AUCTIONS_QUERY = `
query($seller: Bytes!, $first: Int!, $skip: Int!) {
  auctions(
    first: $first
    skip: $skip
    orderBy: createdAt
    orderDirection: desc
    where: { seller: $seller }
  ) {
    id
    type
    contractAddress
    tokenId
    quantity
    seller
    highestBid
    highestBidder
    totalBids
    startsAt
    endsAt
    claimAt
    claimed
    cancelled
    presetId
    category
    buyNowPrice
    startBidPrice
  }
}
`.trim();

export const GBM_BIDS_BY_AUCTION_QUERY = `
query($auctionId: String!, $first: Int!, $skip: Int!) {
  bids(
    first: $first
    skip: $skip
    orderBy: bidTime
    orderDirection: desc
    where: { auction: $auctionId }
  ) {
    id
    bidder
    amount
    bidTime
    outbid
    previousBid
    previousBidder
  }
}
`.trim();

export const GBM_BIDS_BY_BIDDER_QUERY = `
query($bidder: Bytes!, $first: Int!, $skip: Int!) {
  bids(
    first: $first
    skip: $skip
    orderBy: bidTime
    orderDirection: desc
    where: { bidder: $bidder }
  ) {
    id
    bidder
    amount
    bidTime
    outbid
    previousBid
    previousBidder
    auction {
      id
    }
  }
}
`.trim();
