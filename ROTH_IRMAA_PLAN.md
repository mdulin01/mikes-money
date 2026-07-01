# Backdoor Roth + Medicare IRMAA Plan

Status: **planning only** — nothing built into the app yet. Built once the numbers below are filled in and you're ready (target: extend `src/pages/Retirement.jsx` to flag IRMAA tier crossings from projected MAGI, per your stated preference).

Your birthdate on file (`src/constants.js`): **1967-01-11** → you turn **65 on 2032-01-11**, and Medicare Part B/D start that month.

---

## 1. The SEP-IRA problem (read this first) — UPDATED with your real Vanguard balances (6/30/2026)

**Your actual numbers, pulled from Vanguard just now:**

| Account | Balance |
|---|---|
| Rollover IRA (12832686) | $2,107,008.33 |
| SEP-IRA (23273237) | $141,361.05 |
| **Total pre-tax IRA pool** | **$2,248,369.38** |
| Roth IRA (68046335) — for reference, doesn't count in the pro-rata pool | $366,662.82 |
| Taxable brokerage (32575568) — doesn't count either | $23,716.69 |

**Bottom line: with a $2.25M pre-tax IRA pool, the backdoor Roth doesn't work the way it's supposed to — recommend skipping it this year.**

Plugging your real numbers into the pro-rata formula for an $8,600 non-deductible contribution converted the same year:

```
Total IRA balance after contribution = $2,107,008.33 + $141,361.05 + $8,600 = $2,256,969.38
Basis ratio  = $8,600 / $2,256,969.38            = 0.38%
Taxable %    = 1 − 0.38%                          = 99.62%
Taxable $ of the $8,600 conversion                = ~$8,567
Tax-free (basis) portion                          = ~$33
```

In practice: you'd contribute $8,600 of already-taxed money to a Traditional IRA, then pay ordinary income tax **again** on $8,567 of it when you convert — because the IRS pro-rata rule spreads your tiny new basis across the entire $2.25M pool. At a ~35–37% marginal rate that's **roughly $3,000–$3,170 in avoidable tax** for a strategy that's supposed to be tax-free. You get $8,600 growing tax-free in a Roth afterward, but you paid a real tax bill to get there for basically no reason — a plain taxable brokerage contribution would owe $0 today.

**Recommendation: don't do the backdoor Roth this year as originally planned.** It only becomes "free" once your Rollover IRA + SEP-IRA combined balance is at or near $0, which isn't realistic given the size of that Rollover IRA. Better options if you want more Roth exposure:

1. **Mega backdoor Roth via a solo 401(k)** — if you open a solo 401(k) (as sole proprietor/1099, you likely qualify) that allows after-tax contributions + in-plan Roth conversion, you can move much larger amounts to Roth without touching the IRA pro-rata pool at all (401(k) balances are excluded from the pro-rata calculation). This is worth real consideration given the numbers here — a completely different mechanism from the backdoor Roth, with much higher limits.
2. **Deliberate partial Roth conversions of the existing Rollover IRA / SEP**, done in years where your taxable income is unusually low (e.g., a lighter consulting year), converting chunks up to the top of a target tax bracket — this is a real strategy, just not a "backdoor" (you're intentionally paying tax on converted dollars, in exchange for shrinking future RMDs).
3. **Just skip it.** Given the pool size, the $8,600/year backdoor contribution is a rounding error relative to your $2.25M IRA anyway.

**Bigger strategic point this surfaced:** a $2.25M pre-tax IRA pool will generate large Required Minimum Distributions starting at age 75 (current SECURE 2.0 RMD age for anyone born 1960 or later, which includes you). If that pool keeps growing untouched until then, RMDs alone could push you into the top IRMAA tiers and a high tax bracket in retirement, whether or not you ever do a backdoor Roth. That's a much bigger lever than the $8,600/year question — worth modeling in the Retirement planner alongside IRMAA (see open item #3 below).

---

### Original placeholder analysis (kept for reference, superseded by the real numbers above)

You have a SEP-IRA (`taxConfig.sepPlanned` in the app). That matters a lot here, because of the **IRA aggregation / pro-rata rule** (IRC §408(d)(2)):

> When you convert any non-Roth IRA money to a Roth, the IRS treats **all** your Traditional, SEP, and SIMPLE IRA balances as **one pot**. The taxable share of every conversion is based on the ratio of pre-tax money to total money across that entire pot — not on which account the converted dollars came from.

Formula:

```
Taxable % of conversion = (Total pre-tax IRA balance, all accounts, 12/31 of conversion year)
                           ÷ (Total IRA balance, all accounts, 12/31 of conversion year)
```

A "backdoor Roth" only works tax-free if your non-Roth IRA balance is **$0** on December 31 of the year you convert. With money sitting in a SEP-IRA, most of every "backdoor" conversion becomes ordinary taxable income — you're not getting the tax-free result the strategy is named for.

**Sensitivity table** — assuming you contribute the 2026 max non-deductible amount ($8,600, see below) and convert it the same year:

| SEP/Traditional IRA balance on 12/31 | % of conversion that's taxable | Taxable $ of an $8,600 conversion |
|---|---|---|
| $0 | 0% | $0 |
| $50,000 | ~85% | ~$7,310 |
| $100,000 | ~92% | ~$7,930 |
| $200,000 | ~96% | ~$8,265 |
| $400,000 | ~98% | ~$8,430 |

The more is sitting in the SEP, the closer this gets to "just paying ordinary income tax on a Roth contribution" — there's little tax-free benefit left.

**I need your actual SEP-IRA balance (plus any other Traditional/Rollover IRA balance) to compute the real number for you** — tell me that and I'll plug it into the table above.

You told me you want to keep the SEP and see the real cost rather than roll it out — that's a legitimate choice if the SEP's ongoing tax-deductible contributions are worth more to you than a clean backdoor Roth. Just go in knowing the conversion isn't tax-free under that setup. (If you ever change your mind: rolling the SEP into a solo 401(k) — if you open one — or an employer 401(k) that accepts incoming rollovers zeroes out the pro-rata pot and makes future backdoor conversions genuinely tax-free. 401(k)/403(b) balances do **not** count in the pro-rata formula, only IRAs.)

---

## 2. Mechanics for 2026

1. **Contribute** to a Traditional IRA (non-deductible, since you're self-employed with a SEP — check deductibility rules with your tax preparer, but non-deductible is the safe default for a backdoor strategy).
   - 2026 limit: **$7,500** under age 50, **$8,600** for you (50+, includes the $1,100 catch-up).
2. **File Form 8606** with your 2026 return to record the $8,600 as basis — this is what (partially) shields it from double taxation on conversion.
3. **Convert** the Traditional IRA balance to Roth — ideally soon after contributing, so there's minimal investment growth to also get taxed.
4. **Pay tax** on the pro-rata taxable portion (see table above) as ordinary income for 2026.
5. Repeat each year if you want to keep building Roth balance despite the SEP.

---

## 3. Medicare IRMAA — what it is and your timeline

IRMAA (Income-Related Monthly Adjustment Amount) is a surcharge on Medicare Part B and Part D premiums for higher-income beneficiaries. Key mechanics:

- **2-year lookback**: your premium in a given year is based on your MAGI from **2 years prior**. Your first Medicare year is 2032, so your **2032 premium is set by your 2030 tax return (filed in 2031)**.
- **MAGI for IRMAA** = AGI (Form 1040, Line 11) + tax-exempt interest. A Roth *conversion* adds to MAGI in the year you convert (the $8,600-ish backdoor conversion above does too, just modestly); qualified Roth *withdrawals* later do not.

**2026 brackets** (single filer, for reference — by 2030/2032 these will be higher due to annual inflation indexing, expect roughly 15–25% higher in nominal dollars by 2032 if inflation runs near historical averages):

| 2026 MAGI (single) | Part B surcharge/mo | Part D surcharge/mo |
|---|---|---|
| ≤ $109,000 | $0 | $0 |
| $109,000–$137,000 | +$81.20 | +$14.50 |
| $137,000–$171,000 | +$202.90 | +$37.50 |
| $171,000–$205,000 | +$324.60 | +$60.40 |
| $205,000–$500,000 | +$446.30 | +$83.30 |
| $500,000+ | +$487.00 | +$91.00 |

(Joint filers: same surcharge tiers, thresholds roughly double. I don't have your filing status on file — let me know if that's changed.)

**What this means for you:**
- A small annual backdoor Roth conversion ($8,600 of MAGI) is unlikely on its own to push you into an IRMAA tier — but it adds to whatever else is on your return that year (Schedule C, Schedule E, any larger Roth conversions you might do later).
- **2030 is your IRMAA-determining year** for Medicare start. If you're ever considering a *larger* Roth conversion (not just the backdoor amount) as part of broader tax planning, doing it before 2029 (so it lands on a return before the 2030 lookback year) avoids it spiking your Day-1 Medicare premium. Conversions from 2030 onward each affect the IRMAA premium 2 years out.
- Once IRMAA-built into the Retirement planner (next step), it can flag exactly which projected years cross a tier given your modeled income/conversions.

---

## 4. What I still need from you

1. ~~Current SEP-IRA / Traditional IRA balance~~ — done, pulled from Vanguard 6/30/2026 (see section 1).
2. **Filing status** (single / married filing jointly) — changes which IRMAA threshold column applies.
3. Whether to explore opening a **solo 401(k)** (for the mega backdoor Roth path) — this needs your tax preparer/custodian, not something to set up from here.
4. Confirm whether you want the IRMAA + RMD modeling added to `Retirement.jsx`'s Monte Carlo projection now, or after the rental-ownership feature ships.

Sources: [IRS — 401(k) limit increases to $24,500 for 2026, IRA limit increases to $7,500](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500), [TheFinanceBuff — 2026/2027/2028 Medicare IRMAA Premium MAGI Brackets](https://thefinancebuff.com/medicare-irmaa-income-brackets.html)
