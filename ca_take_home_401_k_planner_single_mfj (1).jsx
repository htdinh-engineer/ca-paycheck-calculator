import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { motion } from "framer-motion";

type FilingStatus = "single" | "mfj";

type RateBracket = { upTo: number; rate: number };

const DEFAULTS = {
  federalStd: { single: 15000, mfj: 30000 },
  caStd: { single: 5540, mfj: 11080 },
  ssRate: 0.062,
  ssWageBase: 176100,
  medicareRate: 0.0145,
  addlMedicareRate: 0.009,
  addlMedicareThreshold: { single: 200000, mfj: 250000 },
  caSdiRate: 0.012,
  k401Limit: 23000,
  k401Catchup: 0,
};

const FED_SINGLE: RateBracket[] = [
  { upTo: 11925, rate: 0.10 },
  { upTo: 48475, rate: 0.12 },
  { upTo: 103350, rate: 0.22 },
  { upTo: 197300, rate: 0.24 },
  { upTo: 250525, rate: 0.32 },
  { upTo: 626350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

const FED_MFJ: RateBracket[] = [
  { upTo: 23850, rate: 0.10 },
  { upTo: 96950, rate: 0.12 },
  { upTo: 206700, rate: 0.22 },
  { upTo: 394600, rate: 0.24 },
  { upTo: 501050, rate: 0.32 },
  { upTo: 751600, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

const CA_SINGLE: RateBracket[] = [
  { upTo: 10756, rate: 0.01 },
  { upTo: 25499, rate: 0.02 },
  { upTo: 40245, rate: 0.04 },
  { upTo: 55866, rate: 0.06 },
  { upTo: 70606, rate: 0.08 },
  { upTo: 360659, rate: 0.093 },
  { upTo: 432787, rate: 0.103 },
  { upTo: 721314, rate: 0.113 },
  { upTo: Infinity, rate: 0.123 },
];

const CA_MFJ: RateBracket[] = [
  { upTo: 21512, rate: 0.01 },
  { upTo: 50998, rate: 0.02 },
  { upTo: 80490, rate: 0.04 },
  { upTo: 111732, rate: 0.06 },
  { upTo: 141212, rate: 0.08 },
  { upTo: 721318, rate: 0.093 },
  { upTo: 865574, rate: 0.103 },
  { upTo: 1442628, rate: 0.113 },
  { upTo: Infinity, rate: 0.123 },
];

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

function progressiveTax(taxable: number, brackets: RateBracket[]) {
  if (taxable <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = Math.min(taxable, b.upTo);
    if (upper > lower) tax += (upper - lower) * b.rate;
    if (taxable <= b.upTo) break;
    lower = b.upTo;
  }
  return tax;
}

function clamp401k(empPct: number, salary: number, limit: number, catchup: number) {
  const desired = empPct * salary;
  const cap = limit + catchup;
  return Math.min(Math.max(0, desired), cap);
}

function federalTax2025(taxable: number, fs: FilingStatus) {
  return progressiveTax(taxable, fs === "single" ? FED_SINGLE : FED_MFJ);
}

function caTax(taxable: number, fs: FilingStatus) {
  return progressiveTax(taxable, fs === "single" ? CA_SINGLE : CA_MFJ);
}

function computeYear({
  salary,
  filing,
  empPct,
  matchPerDollar,
  matchUpToPct,
  fedStd,
  caStd,
  k401Limit,
  k401Catch,
}: {
  salary: number;
  filing: FilingStatus;
  empPct: number;
  matchPerDollar: number;
  matchUpToPct: number;
  fedStd: number;
  caStd: number;
  k401Limit: number;
  k401Catch: number;
}) {
  const emp401 = clamp401k(empPct, salary, k401Limit, k401Catch);
  const match401 = matchPerDollar * Math.min(empPct, matchUpToPct) * salary;
  const ss = Math.min(salary, DEFAULTS.ssWageBase) * DEFAULTS.ssRate;
  const medicareBase = salary * DEFAULTS.medicareRate;
  const addlMed = Math.max(0, salary - DEFAULTS.addlMedicareThreshold[filing]) * DEFAULTS.addlMedicareRate;
  const fedTaxable = Math.max(0, salary - emp401 - fedStd);
  const fedTax = federalTax2025(fedTaxable, filing);
  const caTaxable = Math.max(0, salary - emp401 - caStd);
  const cat = caTax(caTaxable, filing);
  const sdi = salary * DEFAULTS.caSdiRate;
  const takeHome = salary - emp401 - ss - medicareBase - addlMed - fedTax - cat - sdi;
  return { salary, emp401, match401, ss, medicare: medicareBase + addlMed, fedTax, caTax: cat, sdi, takeHome };
}

function projectYears({
  startSalary,
  years,
  raisePct,
  filing,
  empPct,
  matchPerDollar,
  matchUpToPct,
  fedStd,
  caStd,
  k401Limit,
  k401Catch,
  investReturn,
  discountRate,
}: {
  startSalary: number;
  years: number;
  raisePct: number;
  filing: FilingStatus;
  empPct: number;
  matchPerDollar: number;
  matchUpToPct: number;
  fedStd: number;
  caStd: number;
  k401Limit: number;
  k401Catch: number;
  investReturn: number;
  discountRate: number;
}) {
  const rows: any[] = [];
  let salary = startSalary;
  let fv = 0;
  let pv = 0;
  let cumEmp = 0;
  let cumMatch = 0;
  for (let y = 1; y <= years; y++) {
    const yr = computeYear({ salary, filing, empPct, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch });
    const contrib = yr.emp401 + yr.match401;
    fv = fv * (1 + investReturn) + contrib;
    pv += contrib / Math.pow(1 + discountRate, y);
    cumEmp += yr.emp401;
    cumMatch += yr.match401;
    rows.push({ year: y, salary, employee401k: yr.emp401, employerMatch: yr.match401, totalContrib: contrib, takeHome: yr.takeHome, cumEmp, cumMatch, cumTotal: cumEmp + cumMatch });
    salary = salary * (1 + raisePct);
  }
  return { rows, fv, pv, cumEmp, cumMatch };
}

export default function App() {
  const [filing, setFiling] = useState<FilingStatus>("mfj");
  const [salary, setSalary] = useState<number>(100000);
  const [payFreq, setPayFreq] = useState<"weekly" | "biweekly" | "semimonthly" | "monthly">("weekly");
  const [emp401Pct, setEmp401Pct] = useState<number>(0.06);
  const [matchPerDollar, setMatchPerDollar] = useState<number>(0.5);
  const [matchUpToPct, setMatchUpToPct] = useState<number>(0.06);
  const [years, setYears] = useState<number>(10);
  const [raisePct, setRaisePct] = useState<number>(0.03);
  const [investReturn, setInvestReturn] = useState<number>(0.07);
  const [discountRate, setDiscountRate] = useState<number>(0.04);
  const [fedStdSingle, setFedStdSingle] = useState<number>(DEFAULTS.federalStd.single);
  const [fedStdMFJ, setFedStdMFJ] = useState<number>(DEFAULTS.federalStd.mfj);
  const [caStdSingle, setCaStdSingle] = useState<number>(DEFAULTS.caStd.single);
  const [caStdMFJ, setCaStdMFJ] = useState<number>(DEFAULTS.caStd.mfj);
  const [k401Limit, setK401Limit] = useState<number>(DEFAULTS.k401Limit);
  const [k401Catch, setK401Catch] = useState<number>(DEFAULTS.k401Catchup);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const fedStd = filing === "single" ? fedStdSingle : fedStdMFJ;
  const caStd = filing === "single" ? caStdSingle : caStdMFJ;

  const now = useMemo(() => {
    const yr = computeYear({ salary, filing, empPct: emp401Pct, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch });
    const yrNo401 = computeYear({ salary, filing, empPct: 0, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch });
    return { yr, yrNo401 };
  }, [salary, filing, emp401Pct, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch]);

  const proj = useMemo(() => projectYears({ startSalary: salary, years, raisePct, filing, empPct: emp401Pct, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch, investReturn, discountRate }), [salary, years, raisePct, filing, emp401Pct, matchPerDollar, matchUpToPct, fedStd, caStd, k401Limit, k401Catch, investReturn, discountRate]);

  const payDiv = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[payFreq];

  const payNow = {
    gross: salary / payDiv,
    takeHome: now.yr.takeHome / payDiv,
    takeHomeNo401: now.yrNo401.takeHome / payDiv,
    dropFrom401: (now.yrNo401.takeHome - now.yr.takeHome) / payDiv,
  };

  const barData = [
    { name: "Annual", TakeHome: now.yr.takeHome, Federal: now.yr.fedTax, FICA: now.yr.ss + now.yr.medicare, CA: now.yr.caTax, SDI: now.yr.sdi, Emp401k: now.yr.emp401 },
  ];

  const projChart = proj.rows.map(r => ({ year: r.year, TakeHome: r.takeHome, Emp401k: r.employee401k, Match: r.employerMatch, CumTotal: r.cumTotal }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-semibold">California Take‑Home & 401(k) Planner</motion.h1>

      <Card className="shadow-md rounded-2xl">
        <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Filing Status</Label>
            <Select value={filing} onValueChange={(v: any) => setFiling(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="mfj">Married Filing Jointly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Annual Salary ($)</Label>
            <Input type="number" className="mt-1" value={salary} onChange={e => setSalary(Number(e.target.value || 0))} />
          </div>

          <div>
            <Label>Pay Frequency</Label>
            <Select value={payFreq} onValueChange={(v: any) => setPayFreq(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly (52)</SelectItem>
                <SelectItem value="biweekly">Biweekly (26)</SelectItem>
                <SelectItem value="semimonthly">Semi‑Monthly (24)</SelectItem>
                <SelectItem value="monthly">Monthly (12)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Your 401(k) Contribution (%)</Label>
            <Input type="number" className="mt-1" value={emp401Pct * 100} onChange={e => setEmp401Pct(Math.max(0, Number(e.target.value || 0) / 100))} />
          </div>

          <div>
            <Label>Company Match: $ per $</Label>
            <Input type="number" step="0.1" className="mt-1" value={matchPerDollar} onChange={e => setMatchPerDollar(Math.max(0, Number(e.target.value || 0)))} />
            <p className="text-xs text-muted-foreground mt-1">Example: 0.5 = 50¢ per $1</p>
          </div>

          <div>
            <Label>Match Up To (% of salary)</Label>
            <Input type="number" className="mt-1" value={matchUpToPct * 100} onChange={e => setMatchUpToPct(Math.max(0, Number(e.target.value || 0) / 100))} />
          </div>

          <div>
            <Label>Projection Years</Label>
            <Input type="number" className="mt-1" value={years} onChange={e => setYears(Math.max(1, Number(e.target.value || 0)))} />
          </div>

          <div>
            <Label>Salary Raise % per Year</Label>
            <Input type="number" step="0.1" className="mt-1" value={raisePct * 100} onChange={e => setRaisePct(Math.max(0, Number(e.target.value || 0) / 100))} />
          </div>

          <div>
            <Label>Expected Return (Annual %)</Label>
            <Input type="number" step="0.1" className="mt-1" value={investReturn * 100} onChange={e => setInvestReturn(Math.max(0, Number(e.target.value || 0) / 100))} />
          </div>

          <div>
            <Label>Discount Rate for PV (Annual %)</Label>
            <Input type="number" step="0.1" className="mt-1" value={discountRate * 100} onChange={e => setDiscountRate(Math.max(0, Number(e.target.value || 0) / 100))} />
          </div>

          <div className="flex items-center gap-3 mt-2">
            <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
            <span className="text-sm">Show Advanced Tax/Limit Settings</span>
          </div>
        </CardContent>
      </Card>

      {showAdvanced && (
        <Card className="shadow-md rounded-2xl">
          <CardContent className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
            <div>
              <Label>Federal Std Deduction (Single)</Label>
              <Input type="number" value={fedStdSingle} onChange={e => setFedStdSingle(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>Federal Std Deduction (MFJ)</Label>
              <Input type="number" value={fedStdMFJ} onChange={e => setFedStdMFJ(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>CA Std Deduction (Single)</Label>
              <Input type="number" value={caStdSingle} onChange={e => setCaStdSingle(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>CA Std Deduction (MFJ)</Label>
              <Input type="number" value={caStdMFJ} onChange={e => setCaStdMFJ(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>401(k) Elective Limit ($)</Label>
              <Input type="number" value={k401Limit} onChange={e => setK401Limit(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>401(k) Catch‑Up ($)</Label>
              <Input type="number" value={k401Catch} onChange={e => setK401Catch(Number(e.target.value || 0))} />
            </div>
            <div className="col-span-5 text-muted-foreground text-xs">Numbers are estimates for planning.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-2xl"><CardContent className="p-4 md:p-6 space-y-2">
          <div className="text-lg font-semibold">Current Year Snapshot</div>
          <div className="text-sm text-muted-foreground">All values are annual unless noted.</div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            <div>Gross Salary</div><div className="text-right">${fmt(now.yr.salary)}</div>
            <div>Employee 401(k)</div><div className="text-right">${fmt(now.yr.emp401)}</div>
            <div>Employer Match</div><div className="text-right">${fmt(now.yr.match401)}</div>
            <div>Federal Tax</div><div className="text-right">${fmt(now.yr.fedTax)}</div>
            <div>FICA (SS+Med)</div><div className="text-right">${fmt(now.yr.ss + now.yr.medicare)}</div>
            <div>CA Income Tax</div><div className="text-right">${fmt(now.yr.caTax)}</div>
            <div>CA SDI</div><div className="text-right">${fmt(now.yr.sdi)}</div>
            <div className="font-medium">Take‑Home (Annual)</div><div className="text-right font-medium">${fmt(now.yr.takeHome)}</div>
            <div>Take‑Home ({payFreq})</div><div className="text-right">${fmt(payNow.takeHome)}</div>
            <div>Take‑Home w/o 401(k) ({payFreq})</div><div className="text-right">${fmt(payNow.takeHomeNo401)}</div>
            <div className="font-medium">Cash Drop vs No 401(k) ({payFreq})</div><div className="text-right font-medium">${fmt(payNow.dropFrom401)}</div>
          </div>
        </CardContent></Card>

        <Card className="rounded-2xl"><CardContent className="p-4 md:p-6 space-y-2">
          <div className="text-lg font-semibold">Projection (Contributions Only)</div>
          <div className="text-sm text-muted-foreground">Assumes raises and return applied annually; end‑of‑year contributions.</div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            <div>Years</div><div className="text-right">{years}</div>
            <div>Cumulative Employee</div><div className="text-right">${fmt(proj.cumEmp)}</div>
            <div>Cumulative Match</div><div className="text-right">${fmt(proj.cumMatch)}</div>
            <div className="font-medium">Total Contributions</div><div className="text-right font-medium">${fmt(proj.cumEmp + proj.cumMatch)}</div>
            <div>Future Value (@ {Math.round(investReturn*100)}%)</div><div className="text-right">${fmt(proj.fv)}</div>
            <div>Present Value (@ {Math.round(discountRate*100)}%)</div><div className="text-right">${fmt(proj.pv)}</div>
          </div>
        </CardContent></Card>

        <Card className="rounded-2xl"><CardContent className="p-4 md:p-6 space-y-2">
          <div className="text-lg font-semibold">Tips</div>
          <ul className="text-sm list-disc ml-5 space-y-1 text-muted-foreground">
            <li>Employer match defaults to 50¢ per $1 up to 6%.</li>
            <li>Weekly cash drop is usually less than the 401(k) deferral due to tax savings.</li>
            <li>Cap 401(k) at the IRS limit in Advanced if needed.</li>
            <li>Actual paychecks depend on withholdings and benefits.</li>
          </ul>
          <Button className="mt-3 w-full" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>Jump to Charts</Button>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="paycheck">
        <TabsList className="grid grid-cols-2 w-full md:w-1/2">
          <TabsTrigger value="paycheck">Paycheck Breakdown</TabsTrigger>
          <TabsTrigger value="projection">Projection</TabsTrigger>
        </TabsList>

        <TabsContent value="paycheck">
          <Card className="rounded-2xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-lg font-semibold mb-2">Annual Paycheck Breakdown</div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} />
                  <Tooltip formatter={(v: any) => `$${Math.round(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="Emp401k" stackId="a" name="Employee 401(k)" fill="#6366F1" />
                  <Bar dataKey="Federal" stackId="a" name="Federal" fill="#22C55E" />
                  <Bar dataKey="FICA" stackId="a" name="FICA (SS+Med)" fill="#06B6D4" />
                  <Bar dataKey="CA" stackId="a" name="CA Income Tax" fill="#F59E0B" />
                  <Bar dataKey="SDI" stackId="a" name="CA SDI" fill="#EF4444" />
                  <Bar dataKey="TakeHome" stackId="a" name="Take‑Home" fill="#A78BFA" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projection">
          <Card className="rounded-2xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-lg font-semibold mb-2">Retirement Contributions Over Time</div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={projChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} />
                  <Tooltip formatter={(v: any) => `$${Math.round(v).toLocaleString()}`} />
                  <Legend />
                  <Line type="monotone" dataKey="Emp401k" name="Employee 401(k)" stroke="#6366F1" dot />
                  <Line type="monotone" dataKey="Match" name="Employer Match" stroke="#22C55E" dot />
                  <Line type="monotone" dataKey="CumTotal" name="Cumulative Total" stroke="#A78BFA" dot />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted-foreground mt-2">Future Value and Present Value shown in the box above. Lines show annual contributions and cumulative total.</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="rounded-2xl">
        <CardContent className="p-4 md:p-6 text-xs text-muted-foreground">
          <b>Methodology:</b> Employee 401(k) reduces federal and CA taxable income. FICA and CA SDI apply to gross. CA brackets use 2024 tables; federal uses 2025 brackets. Projection assumes end‑of‑year contributions.
        </CardContent>
      </Card>
    </div>
  );
}
