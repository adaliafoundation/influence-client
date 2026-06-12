# Client Licensed Media

This folder contains manifests for media that is licensed for use by the
Influence client but should not be published through the SDK image pipeline.
The externally hosted media assets referenced by these manifests are not
covered by the repository license and are licensed separately for use with the
Influence client only.

The manifest stores logical asset paths only. Licensed media URLs are built from
the deployment IPFS gateway, the configured client media directory CID, and the
manifest path.

```sh
REACT_APP_API_IPFS=https://developed-white-hedgehog.myfilebase.com/ipfs
```

The default CID lives in app config at `ClientMedia.cid` because these assets
are tied to the client build. The regular app config env override is
`REACT_APP_CLIENTMEDIA_CID`. The client does not fall back to CloudFront.
