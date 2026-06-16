/**
 * Bulk upsert per-match resale Discord webhooks (matches 51–104).
 * Usage: node --import tsx scripts/seed-match-resale-webhooks-batch-51-104.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

const DISCORD_WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i;

const RESALE_WEBHOOKS: Record<number, string> = {
  51: "https://discord.com/api/webhooks/1516387550871420948/6F4s82Y-oPxIZhr7BMXOFKmDcoxMEfAJU-FEI9avfKDjknmxlpv3-5vZkNbGr3uf_Mp4",
  52: "https://discord.com/api/webhooks/1516387738608205965/WQ2YPgTwyMbcaVfQhBwls5wpSNmiO1gDl3CFfckoAucSUUxb3IyT3jnR9-NkwAvlDXaR",
  53: "https://discord.com/api/webhooks/1516387810880258088/oS5KTcwZwHJBNIPl_Y-nJIyqcgykOFo346zSYHMlm3tBJ2ww7-mT_KCyHota9IXbwvgD",
  54: "https://discord.com/api/webhooks/1516387885786595419/Z1X5ZNMMG7-Z2pxnyy6m-pVQYJHSGU70KBwJ23dAleat4uZC3jN74_R7VRWNdVSv92Xu",
  55: "https://discord.com/api/webhooks/1516387967558484080/peKZg3lcTxTvJT2GwYyKIilNlDjnFdV5YvZ-68yktetuYHOnORoY-onUfqTglBDFZ7FW",
  56: "https://discord.com/api/webhooks/1516388037376999484/43Aaygz7Ls-tz3PwgiP_pe3vY3xVdiBVyJ55SAikmu2YqK8NdzSsuJClz6HiSI1E6Iv4",
  57: "https://discord.com/api/webhooks/1516388109393199174/hqnstc4ep4x__kloB7jbRaCCKnrazxP0IbUOH1tAUQWMdXrhlqrMgMxxyQw0qxnVnlUl",
  58: "https://discord.com/api/webhooks/1516388171112386681/hp6UGi7Xnd4AQcDhLRNqHAFIsGG72vmhm49UqdUShjZW6DINTWLIvX-VO1OHIar69wo2",
  59: "https://discord.com/api/webhooks/1516388240205025290/7n1jF2_SE3Ae1iRYeQgV9les-XzozcpjcZG0MnHArtDN2JZzbWNBkvmy2YCnswo92_Wr",
  60: "https://discord.com/api/webhooks/1516388313689231461/3ZSPv3UPToCvKrHZVBhIPnhEI3blC3D8uIKS7pmRv0ymHQdkrJ16e1dROB3r2VoZymTP",
  61: "https://discord.com/api/webhooks/1516388378528972860/laQejncZZLcgII_k6w_9YZQ-viaEpgdnC-o8o7ykXomGmdYk4s8qvucjCn1JVqASPRtG",
  62: "https://discord.com/api/webhooks/1516388449819824148/HGJG_tw8bGD6brgeBpoTJmA92O_cieBeQ4VySQPDWH4s-6x0tQPCr7ORZZGfV3C5ZvxY",
  63: "https://discord.com/api/webhooks/1516388524734283817/xFbBuer7dolLkKExb7gQ83lmcZ9xvZh6hS3q3I7SGGFCz9EBnO4zMAbgYFsQKo4o9BHI",
  64: "https://discord.com/api/webhooks/1516388595827740682/1MiJvJLKwGMYdLLoGqm9_odOTONGWIJ4cUHXO7aav4xyl1RwAK3qytDZ7McqSG-m9gcg",
  65: "https://discord.com/api/webhooks/1516389162595389463/UU8POA5fg-lfvuhQ3aOlqQSmLF6g5ZjVmJLrLZbFnYuRnMZ0bUfD5kuFdIOVzB0G8cVg",
  66: "https://discord.com/api/webhooks/1516391822463864884/DbUyabsDpHfDJspPstIxUOaptARGLXWeknvfM4hfPPQc0o7Yg_sBgA420X7HsZIXPNCY",
  67: "https://discord.com/api/webhooks/1516391888297398322/q39NEy8t0Zs25gxnINZaHaCKV25eZVwxJS4o0LpTyWtc69hoA3CO5mX-7WVFLNBTaq2O",
  68: "https://discord.com/api/webhooks/1516392000612728982/NL1TASR65a_Km3S6wvxorpSIaBqgqI2QiiB-eMsW6SmxXhY7G2800BjoFJQr6u2-hvzL",
  69: "https://discord.com/api/webhooks/1516392070955274332/geaMHErUDhJ4dCjiJQnc-uMEMNcZn7mBF06EhaLKk2TeOhklgiLiNdls75RFdO4qOXHD",
  70: "https://discord.com/api/webhooks/1516392163095613502/p0byM18jlhjRbGbe_d4_Gwq4ZnP8gie_Occ21zT9TQNGmnNkcEFY_lsoc-78gND_THjV",
  71: "https://discord.com/api/webhooks/1516392261724672030/F647BVqoCesBFlELMzm-RutCnWs1swl-SeWJ54HPqWiyq2z31nrGk3f0DnJlxx57wRb8",
  72: "https://discord.com/api/webhooks/1516392787912954066/X8NoL0O2UCCJvXAfX-sKpNrqeIQhRMGMr8uTbDwxbcfjq091ocpPnsUCXDAU1bFkAtjf",
  73: "https://discord.com/api/webhooks/1516395198127800340/OyzvrprZ0j7HFkEL5NJh5kCDm4MHdzj5z6osiNCe08G9Na0rW0IUEzQPh16ZhXCybM5_",
  74: "https://discord.com/api/webhooks/1516394593653100554/UrlUPm_CXGttyocDTYe-L9CxuOgeiiJfqn1Mputqrw2JW2FLyetZ7ErlNVHejs2ufHuQ",
  75: "https://discord.com/api/webhooks/1516397155269607525/ZUCBOTablutnY224RE-TApR6qzi5yDBMqNCPLtHUiIrDCGUqywzxh9ngwoRNUhkJAWUO",
  76: "https://discord.com/api/webhooks/1516397237113065502/ahgZsxRHoRxEcUiWASYNskALEHA0F_a4tPd40JNQrjdWV230GjKPNMOk4XpZ4t-MZZ0M",
  77: "https://discord.com/api/webhooks/1516397310609985576/2HNu2bLezalSowfCijtsFhxti0944Y1EIiA7lwKQk3mD5tmvxu1NgdEffiV-q73MEANH",
  78: "https://discord.com/api/webhooks/1516397414582321254/YTzLxn99Qmeu5qjlrRG7NamHFjb-kPhZeFJvKV-vfehumuIAa70lVd21JxPHILg1MKOb",
  79: "https://discord.com/api/webhooks/1516398219095965839/TrDmUzXUWMYpCXI-5ayEQwhMZj-jiF6Bhy_YLuNXvZw9TCjFDo5ZtUhUgexghFS780c_",
  80: "https://discord.com/api/webhooks/1516399255244505188/0-gRtNSk2QK4KrxUNQFY90ve5myNm-9d50pdsMEbre1R2L9uf5muHMId2Fm546sJX66m",
  81: "https://discord.com/api/webhooks/1516399426023719012/Diren1tj_xJguKXXA9LdRjGrn8QxXsI0IcgsFmEpsg5dE-QR0oNMMqi2AOIONtV41a5m",
  82: "https://discord.com/api/webhooks/1516399728919842876/mSGVf4OknBXa89Jxp09ZotzO3SD9vDlqSDNjgxJIfxNuVYLclHsML60hkEFSPxIR4dVU",
  83: "https://discord.com/api/webhooks/1516400331351785553/Fc2OMKEK2ws8jFnTA45cPtiPmXAvk3SARYT3sBwNNyQUSUx0LeyBjSpLfhRRWXQFbGMJ",
  84: "https://discord.com/api/webhooks/1516401000297009173/-xcMLb67_J6EO6VdIKtovEarUoWxlfuBiWWei9ch-bteCxMYrNZ4TUNRufUGqguC6cwh",
  85: "https://discord.com/api/webhooks/1516401237384368219/fsJGGDHRh5hQK-7b4Ug677IEMWTByr_BwxHehoT12pdef1OWL6RMvoQgPM_OFYb_Bilp",
  86: "https://discord.com/api/webhooks/1516401539982561341/mvI7yUJdT8jskF_FJ_0WBpBJVf4QQ9uu-OhyilczbzTVqwgSUMMzY49gHx2u5Bi4H8cc",
  87: "https://discord.com/api/webhooks/1516401843121426695/kAUNFqqcafEyICv7Cup6PlWkPenkPeC8o4dzWj85fNEAQ6PQD8enIEm4WOmJGw333iZJ",
  88: "https://discord.com/api/webhooks/1516402143769268374/Ja8ZyWl0-Lj051pzqPECftajoKS6RZ7Fwj2s__JedtUxiD5Fp88Xrjtw0bZwVZ2yytYi",
  89: "https://discord.com/api/webhooks/1516400633756913704/gtMbsw5nGisVv5C7Oim_0LWxSPoh7_atluJNH1nMuVi7e52Pi5-ieI0-7AF8zAXIRe0p",
  90: "https://discord.com/api/webhooks/1516402445817741388/OEheVWYjOcB1dRyUukZNOj7xxb5sSJ5y4x-9NvnkgpWmhV0pvsv_XTHuTjPLI2DXMzJu",
  91: "https://discord.com/api/webhooks/1516402747807764570/sd3c6n157kvURifrMiCC4OIiCxvrBEaDouAkpVy3K5ynmpMdv8O2NSH0bP7HE3-gNsVX",
  92: "https://discord.com/api/webhooks/1516403049810100344/YMeBdoMfVnoRUNx80uS-VeGvIqe2UYiU-_notlAjIs3rF_bmP6mxBnQCZJM463hwDVqs",
  93: "https://discord.com/api/webhooks/1516404257396494356/GoH7fm3kkBVyjaNj24KhAphgMSfX2tz4RUykiafAqeZ48tZwUbJ0CTSthrrdrMHZDAdk",
  94: "https://discord.com/api/webhooks/1516403957004505188/0a_pYOupj7_pb_aW0ch-u6lH3_L6mbIo8FrENLVRQgXoAsSnOLajtcG0WX8zE2bsgaTX",
  95: "https://discord.com/api/webhooks/1516404559050838058/K6TN_5cG-9qmPxbDDNOgd6KuAW_IJYflXHRmP6M7-yHiGR6_F1YtjTrxaMp7Nqvw_sct",
  96: "https://discord.com/api/webhooks/1516405767656439819/EVHdHMJeNuvVUHzitn--5YrCS5677p5J8b2XN8QVv-EZO01gKLoY8mtPLTJEVG3qwq_E",
  97: "https://discord.com/api/webhooks/1516407579637452854/Wrm-quWdMAnlGD3EpKJU_Nm2ZQYL9W4U6AYU796xyFV9K3hP2zU3ooIusnX9OOUZIK5y",
  98: "https://discord.com/api/webhooks/1516406673231839379/qiITjeTRI8clbY3EIAZMqYRwTj5EFF6bL-K4MPsPdXHe1QvsqeM_SokI0qmLHI9penms",
  99: "https://discord.com/api/webhooks/1516407277060362415/AVUdT-rqOo2iYEI4c4dxcC0QxakNG7KIMmW_GjrSRq_qEG-fzDINGk3gqujbq5aoGufP",
  100: "https://discord.com/api/webhooks/1516408430502482070/79mq1sn4p7gpau6OmJHXp2LpXSV9gAPbcAc1l2E831ZF4bwNrweXYJuWSbIhWZIYp7Yg",
  101: "https://discord.com/api/webhooks/1516408518503174176/lDoiuuqvSmt0gCuJAeqC3Go5PzYIXsVpsiQ35g7yBRX52d2Vj_W3U28IIuZzydziTwNU",
  102: "https://discord.com/api/webhooks/1516408787760713798/Wkf5i3P0Wn7SFjgDw6euFa1v5_dyFyLVe1qJ3xFyODGTr5glCQV-DEKSrjz4q_Sypssb",
  103: "https://discord.com/api/webhooks/1516409392021639279/VKFWrJ1w83FgOHdo__Bmwh1CV4NqCCd62XzjaNRZTM5miAEjtLUvLaKEuPCb78RV6Thy",
  104: "https://discord.com/api/webhooks/1516409089662390413/IK3npxPxR1skNlI6EZYrNYsaxh0F0x7w2G4oH3PZsFAbAq-kRM1stkaOlxamWtGZ-nlR",
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
    }

    const { rows } = await client.query(
      `SELECT match_num FROM match_discord_webhooks
       WHERE match_num BETWEEN 51 AND 104 AND resale_webhook_url IS NOT NULL
       ORDER BY match_num`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          seeded: entries.length,
          configuredResale51to104: rows.map((r: { match_num: number }) => r.match_num),
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
