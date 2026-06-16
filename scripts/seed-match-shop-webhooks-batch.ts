/**
 * Bulk upsert per-match shop/LMS Discord webhooks (matches 19–50).
 * Usage: node --import tsx scripts/seed-match-shop-webhooks-batch.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

const DISCORD_WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i;

const SHOP_WEBHOOKS: Record<number, string> = {
  19: "https://discord.com/api/webhooks/1516375298793279488/5dlkL5Xxj07mpzBjOR6tbSh3RxiNjiK9xxn_pephWqgOXmANHLZE9K-PH9y89WeCSnAr",
  20: "https://discord.com/api/webhooks/1516375781306007572/9uYE7-4ws65mz8yQ3Jl9EvR7r5HV2epHaTthkqJ-qDETpsSxTkt8fFjVNuKAETz1Gz_n",
  21: "https://discord.com/api/webhooks/1516375896678858762/TRVT0LirdzcD0HWmibxVuC-raym3vr338tDP2T-0mlSRwNLx5NFKG6aY74Q83ywCU9eN",
  22: "https://discord.com/api/webhooks/1516375993550508094/KOXvVaOOQ9w8XB7MzXuvurgy6Shs9QLYnbvf08ycf80NiASmDb1lh7970TfgCsJuSpHI",
  23: "https://discord.com/api/webhooks/1516376113738289222/k-pAUOM8vYDp06nE9FS75E0i9guo75EyqbERUunQHt_HeivGjH6N0vwoFkRDqphxcmgg",
  24: "https://discord.com/api/webhooks/1516376233926070403/PjlRYQD1rV1GUTqZlMS8Cln4swJZJYD3ZE4zci_ep2eNxeyiaZ5p4DFG9u4FpvuDly1r",
  25: "https://discord.com/api/webhooks/1516376335407120474/7YxBxNbTFjm2P1f7sYKS8lmKP82fkx6o8RjHUEYWS80vBXFazi4lopA2Z140V5VDNz8N",
  26: "https://discord.com/api/webhooks/1516376483549941871/GtjihhmHMvhsgn0wU6l8s7E3sViyfxLSNV-GVU-6TIfQAmhL2A-y5JC6PTWgEqi1UMmk",
  27: "https://discord.com/api/webhooks/1516376577384906906/nUIF4N6YDM3Dw1f_wcVdGHNHyBxpex88KWzIWhdlMka2J0GPUJKjUhf7y24GTsyFaGO4",
  28: "https://discord.com/api/webhooks/1516376704845615264/bfJn2RAANpZDaDTCZYpFzwHmGY-CyUHfyeUpU0Q35ORz88btWq0aAFHps3FIGRE58lKC",
  29: "https://discord.com/api/webhooks/1516376798823448778/1c1kfjoVM1-lgiFdxFr6uLU16_sR6JauCkLKD_JA6igHe9AFxr_H3_hLfH43mjI208TB",
  30: "https://discord.com/api/webhooks/1516376901969645579/HyOn555kjKta0rZyLliDpe3XbxSJrGoTNgC6HF1o2adXZtEH6tE17Uzg6Hsikh4rXTvO",
  31: "https://discord.com/api/webhooks/1516377006441238610/kesj4aQ0k3w_FvLivqSpthujF_lMMpGu43jnkaQ28twkMMBG0QxFFS6oHr4VNFm_kap6",
  32: "https://discord.com/api/webhooks/1516377239854256169/zE-mSmz26KuEK155NtzRtiLkc3R_LnnypRP5Zpbg3uCKkV5NEsk_9IbuBOxDOhz-jNJn",
  33: "https://discord.com/api/webhooks/1516377324734648413/OdqeG1UGuEA6e3UHK0KKAOiw3Jyup08nVHj5oAl0CeQaiP7-gWP1WoO925ZMmKBkNoSB",
  34: "https://discord.com/api/webhooks/1516377422042497135/SIDjNJETgppZdrdakUP__i-iC617IsylCIgJW31mgGTnbcxpEeOOKkB751gKwr0SDehO",
  35: "https://discord.com/api/webhooks/1516377504896778303/pXUBFW1_w1szX5EQxBn76EDL19qSzGZbIFvaSudryry5dWmH5x0MU0Mgc9f66sQ9btei",
  36: "https://discord.com/api/webhooks/1516377662065737839/2vOwTRq4hhSGLvkoHm-RWBrni9xwb_P0Tg3MOH4fUeUFmU5kWHdJYUEdA92rGPdApWtJ",
  37: "https://discord.com/api/webhooks/1516377813156892772/oDQKzp3UZaeqTNUO0-THBsV7QLeux0GyzBraPTE4SH0TGhMDd5fWYAQ3fd4_M_t3j4Fy",
  38: "https://discord.com/api/webhooks/1516377905817587723/-w_e-tn8bucGmG6nM4HDrf9W34Ns8ppOXq8v9ypKN2WYTfpl4LmhUlceueonawBGrBhx",
  39: "https://discord.com/api/webhooks/1516377991075074058/6UAwgXb7RcBZsEEt5MwstmAdWJVRKEe_T4dZ5RTG9ycLWg3mSqjkLx6UrIaIFKu7OjWW",
  40: "https://discord.com/api/webhooks/1516378103897653309/4kIVuitugXPF6v8bI0zFg_dbfXWG_AEh7DALhMd_3e4PGo_ghxhKi6XE5C9T4Suc9DTH",
  41: "https://discord.com/api/webhooks/1516378180674523176/HbmTGqkm70T83dBv4cb-FMzSmVZk6wMWWCB9VvvWMnczcFdAmZCTZtq0ph0RC0DdtQOT",
  42: "https://discord.com/api/webhooks/1516378315944890438/QTNatWCvHKO2v2up8v0h3vVB0IO7BoKDm421okcJKX_zuqgBxl4tK8fkRmJv9OQpknZN",
  43: "https://discord.com/api/webhooks/1516378507427713144/L7XK3bRn5fTkRfIwJzEelq2yJVMryvtZKIS5Aen1DmhOhK5EsxmnIWEJ74YE6OQwWNQK",
  44: "https://discord.com/api/webhooks/1516378584325816320/SIt0RkhQP_HGs5G15uHz1Nuzv9t-f2SfKzzxbCA0_iqQ1nbK9kQBDkqtVHkymIb1epLN",
  45: "https://discord.com/api/webhooks/1516378669684363376/kHF97Gj5gxLOrrJXsqo17WwBzDPa6iiUOZauZ6xho7uhyagCvrkQmyW6hj3skr6ycoQh",
  46: "https://discord.com/api/webhooks/1516378890354823201/nkGgwf34OgBX9ZD4PutY_eUDZ52QG8BJOEueNhqNCXxjKhAom33vkjHdlax0pdt-mrex",
  47: "https://discord.com/api/webhooks/1516379192965599255/OtIma_RxGrPyf1NpOBCCZPOe-A7HLdUDbx7ACG9-_B0w2cRADw6JpRYGMo7W89uBe51A",
  48: "https://discord.com/api/webhooks/1516379494615617667/aVWRK4JCqAWuJxwa_fSKH48NC0q6TcOrUf8noGIGqsgehG3Zicro2LQGtpj-OHaKf07E",
  49: "https://discord.com/api/webhooks/1516380098251718736/O3BmrBsIR48VfWO6vpnO0gJ9HoLRaZ4A2vGIoQFVc5bcud5gK8OhdqnbtY0jH-eDwowQ",
  50: "https://discord.com/api/webhooks/1516380498169958471/lqfs81uvWmsXY_gYX-0diYF6aE3ftcoB62-5-SjqhJaPrhxmM71dRsnFW0Ha8I43X_WZ",
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const entries = Object.entries(SHOP_WEBHOOKS)
    .map(([k, url]) => ({ matchNum: Number(k), url: url.trim() }))
    .sort((a, b) => a.matchNum - b.matchNum);

  for (const { url } of entries) {
    if (!DISCORD_WEBHOOK_RE.test(url)) {
      console.error("Invalid webhook URL:", url.slice(0, 60));
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const { matchNum, url } of entries) {
      await client.query(
        `INSERT INTO match_discord_webhooks (match_num, shop_webhook_url, resale_webhook_url, updated_at)
         VALUES ($1, $2, NULL, NOW())
         ON CONFLICT (match_num) DO UPDATE SET
           shop_webhook_url = EXCLUDED.shop_webhook_url,
           updated_at = NOW()`,
        [matchNum, url],
      );
    }

    const { rows } = await client.query(
      `SELECT match_num,
              shop_webhook_url IS NOT NULL AS has_shop,
              resale_webhook_url IS NOT NULL AS has_resale
       FROM match_discord_webhooks
       WHERE match_num BETWEEN 19 AND 50
       ORDER BY match_num`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          seededShop: entries.length,
          matches19to50: rows,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
