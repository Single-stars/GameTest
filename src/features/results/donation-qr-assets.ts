export type DonatePlatformId = "alipay" | "wechat";
export type DonationFeedId = "mixue" | "porkRice" | "free";

export type DonationQrAsset = {
  bytes: number;
  sha256: string;
  src: string;
};

export const DONATION_QR_ASSETS = {
  mixue: {
    alipay: {
      bytes: 122271,
      sha256: "25d308367486ef89c16dfdd0f9b2d573a3074b0a97f6c9bd8bfc693f820c5a7d",
      src: "/donate/alipay-mixue.jpg",
    },
    wechat: {
      bytes: 157278,
      sha256: "ab10dae9f4129049f55e7bcf0dc9b2d37a32e7037c30d2fa088838a1776a29c3",
      src: "/donate/wechat-mixue.png",
    },
  },
  porkRice: {
    alipay: {
      bytes: 123011,
      sha256: "e939ed1870d3c36ede5914563f267a5ace912ddb31c18c6963acc10298beb8a5",
      src: "/donate/alipay-pork-rice.jpg",
    },
    wechat: {
      bytes: 158027,
      sha256: "5f80a96f926df77c34abddc8d06b6b72132719089f24ad0f571c356cf8e87bd8",
      src: "/donate/wechat-pork-rice.png",
    },
  },
  free: {
    alipay: {
      bytes: 129626,
      sha256: "a13f676686897c35ad733ef5f9aad2c69303d13c03860aea677156b263966be8",
      src: "/donate/alipay-free.jpg",
    },
    wechat: {
      bytes: 151066,
      sha256: "4d61665f27fd46486546c9f5100d84e8ab8f0a20c3c0e4a3d54dc94ed7098dbb",
      src: "/donate/wechat-free.png",
    },
  },
} as const satisfies Record<DonationFeedId, Record<DonatePlatformId, DonationQrAsset>>;

export const DONATION_QR_ASSET_BY_SRC = Object.values(DONATION_QR_ASSETS).reduce<Record<string, DonationQrAsset>>((assets, platformAssets) => {
  for (const asset of Object.values(platformAssets)) {
    assets[asset.src] = asset;
  }
  return assets;
}, {});
