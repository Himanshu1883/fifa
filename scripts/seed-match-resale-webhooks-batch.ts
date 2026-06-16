/**
 * Bulk upsert per-match resale Discord webhooks into match_discord_webhooks.
 * Usage: node --import tsx scripts/seed-match-resale-webhooks-batch.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

const DISCORD_WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i;

/** Match 36 omitted — no URL provided. */
const RESALE_WEBHOOKS: Record<number, string> = {
  20: "https://discord.com/api/webhooks/1516357424766783630/OGPUPn08TBzAz8H44b4jRL8YUvansXwBJUaLyjZHfSHcpLDzdQ7htOCZmRKhU8sYC3O6",
  21: "https://discord.com/api/webhooks/1516361674783981578/Qx8_xI27WEtf4lpSRURqa1jnZic86_dJw1n8r2yda5Ew31Mp6HSwgm9kDpl2W3osk4d2",
  22: "https://discord.com/api/webhooks/1516361972994801776/4Ep0TPWLH-e7EOaBuxb4TXFhmVvMYqBN5uEaF0rfd9FQeRoavsEeFN5r8GESnDibYVTo",
  23: "https://discord.com/api/webhooks/1516362116012183625/85vKfMgCI3MdDd04FjdVpjidLpnmOrLv5Z5FUijdBq2_nXOO9tAl872eajmSV33EbBzY",
  24: "https://discord.com/api/webhooks/1516362268433055825/GnXRZ6O-RzxJclgtNGwxikhaqp_jOwggpOUifBF8L6H-X2AMrQDVSIm0SGQPM9-9UQyf",
  25: "https://discord.com/api/webhooks/1516362391850319902/wA-Xs5V8z3i0htkpmxHvyH-E21LL56q0avajB-Dbe5b8be6GuJawIJk6_EPcP-Rl4Ho8",
  26: "https://discord.com/api/webhooks/1516362801789276251/fDUles38NXXNdHzd_9TbtWltSFlHup3_o2WXYO6sGEFZcYY6nCc-m63LviiABW7s5x6f",
  27: "https://discord.com/api/webhooks/1516362934819885066/JkfeNN5cQ_pAPcTXLy3ifBaM6yHzbVk3A7zQt8DPTV7qOez4zh6miCtTpq-wGGjJE8IZ",
  28: "https://discord.com/api/webhooks/1516363065262739538/tYMMHRGiGP8wJVsKwc19Bgu-DlwKkPH2zNj2H4jNK_cV8KfkTaBvvOSeKtQ-RyTBzOi2",
  29: "https://discord.com/api/webhooks/1516363227255144449/93_w6Fv9QOi0B_T8VvaORe1adRbuXfsJykcLq0gV0440veaANe4usLC4Z9UOMLpgoAhg",
  30: "https://discord.com/api/webhooks/1516363347313037343/2aZ3b9aGPAi3C_09fs1QTxdeVFz9dIOSF8yrRPOl0Yv95sK1hhk_B_ejoqc4wTu2TryK",
  31: "https://discord.com/api/webhooks/1516363498370891837/cqpli-EJ7wj5ZUlxrhQOQOyMtbBW33nPJVuEm2f4tu5CsM3l5VYPHOC1XAlnQGWjJVD-",
  32: "https://discord.com/api/webhooks/1516363694135840768/PiH7Pi6TqrNQ7EBbLd_iyDLz-Her8Y1G9HqD_GYCQ8lAnzmy_NPWRMYk1Hbsjs2-7Dxx",
  33: "https://discord.com/api/webhooks/1516363988219203686/HTsZcKiZQtA_CSevzgMo9IR239eY8X1gk5ZmFx0CUBeHiE40qIFTsINZ9fcAxyf0pJ-M",
  34: "https://discord.com/api/webhooks/1516364118645538886/37_2EAoJ1y4SJQdqVE9Y9-XBWy7Jl-KvZzEbCWSE5goiRY2aid69X2l6r2BGGGYdFxpf",
  35: "https://discord.com/api/webhooks/1516364222164897822/3b0qnh6Gk1EdbvUkxv361V4AKqETw2C8piM6HVBzA6GvmpvO47lNxChQ0EWDRxpHquXN",
  37: "https://discord.com/api/webhooks/1516364493092032582/m2QX7yiGxDdyqK_NG3fRFMwDORwpaVq8uvimLiWOOLzXUbpSoN42k9VcsR6-IZWbiYb7",
  38: "https://discord.com/api/webhooks/1516364611471933450/R3aO9tnvQt6D-pv2GWKQlpuRPgtBNzCk34vg79EZADFT7FZnqBsv-iM79ApRdlTAtK-D",
  39: "https://discord.com/api/webhooks/1516364695186178109/IbRJfztuBKT32Ji2QEPdHrL6oBZYWPN_f_oxnmn3Irl6MuyNjZz2X5OupAOZYLv0HYq2",
  40: "https://discord.com/api/webhooks/1516364779076321300/1xag5A0d0rMC_RfvNSwLuU7O5Yz8pQbvWQz1nstocI2k-1GlT21wmVpdA22r8hauPayu",
  41: "https://discord.com/api/webhooks/1516364887272460398/sna8YCwMPuKE46UjkAvdwDPkTJVwvHu3HDb68khjQo9lfOX7EFUU2Z5DI-A6HKUJDMjn",
  42: "https://discord.com/api/webhooks/1516364964225486908/7mCxPSxmDEoFHCdAqV91z6tItgK5lmBiIW1fGzBL994ib6Ubvbf4IZcPNnPMStDoCGT_",
  43: "https://discord.com/api/webhooks/1516365043908870274/7kM_4xvHHn-Dlr--_gvpuHgVvdomzwB0fCZ53JquYd1rvbyHA1YNx7tceMWRs1VvLrtJ",
  44: "https://discord.com/api/webhooks/1516365127522189382/TEv1let6MirpOt_5g2eipEp9ivzqEgsCLjhlp86EeqlcN8Qhvgv0h0IJ7DMiIcFD6XGx",
  45: "https://discord.com/api/webhooks/1516365219083976775/jxYCAC6vtBNBDGK36Sqh6M2AkmvkCry3DFkde10ygfRLfKT6Pbczjtj4q9HsraLPkQWW",
  46: "https://discord.com/api/webhooks/1516365307285995550/eqawDtfL2fgKL9XiB0Z-OKkKntoTfUE7hWQx4wG04V1a8e-d1-b-Wkh4wEVex8BcRIi3",
  47: "https://discord.com/api/webhooks/1516365397530513482/9_aJpMkxq5R9tc5dYNdjfL9YCpFEQL4cJ1iZgbvYEVVlCRM-mvmyJ9aeTSG0x5w_PtfA",
  48: "https://discord.com/api/webhooks/1516365506800652408/DiZNqN8iaISfRkzPGlSqBeiSxzjxdXCibhj2X4q5zqZ3FgT3S-qArFdZk3ux_73q4wSK",
  49: "https://discord.com/api/webhooks/1516365586836492309/JbhprnZXOqdOQd4nXXY9lrIxJwm5PNcC6Wq37ZIVpHq37rQzKGw3eFLwIvjuC8J74sUV",
  50: "https://discord.com/api/webhooks/1516365670403538965/5U33uGDEfr2W_H4ipw5OhzM4WJGw8MV6X_YuBZfr8HznZt1YDF5FuYuSoSCbJKh-Yaik",
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const entries = Object.entries(RESALE_WEBHOOKS)
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
  const results: Array<{ match_num: number; ok: boolean }> = [];

  try {
    for (const { matchNum, url } of entries) {
      await client.query(
        `INSERT INTO match_discord_webhooks (match_num, shop_webhook_url, resale_webhook_url, updated_at)
         VALUES ($1, NULL, $2, NOW())
         ON CONFLICT (match_num) DO UPDATE SET
           resale_webhook_url = EXCLUDED.resale_webhook_url,
           updated_at = NOW()`,
        [matchNum, url],
      );
      results.push({ match_num: matchNum, ok: true });
    }

    const { rows } = await client.query(
      `SELECT match_num FROM match_discord_webhooks
       WHERE match_num BETWEEN 17 AND 50 AND resale_webhook_url IS NOT NULL
       ORDER BY match_num`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          seeded: results.length,
          skippedMatch36: true,
          configuredResale17to50: rows.map((r: { match_num: number }) => r.match_num),
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
