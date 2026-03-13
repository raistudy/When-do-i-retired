from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from core import RetirementInputs, retirement_snapshot
from core_networth import build_payload

app = FastAPI()

# This allows the frontend (running on port 3000) to talk to the backend (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://when-do-i-retired.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Retirement ──────────────────────────────────────────
class RetirementRequest(BaseModel):
    currency: str
    current_net_worth: float
    monthly_contribution: float
    years: int
    annual_return: float
    annual_inflation: float = 0.0225
    swr: float = 0.04

@app.post("/api/retirement/calculate")
def calculate_retirement(req: RetirementRequest):
    inputs = RetirementInputs(
        currency=req.currency,
        current_net_worth=req.current_net_worth,
        monthly_contribution=req.monthly_contribution,
        years=req.years,
        annual_return=req.annual_return,
        annual_inflation=req.annual_inflation,
        swr=req.swr,
    )
    return retirement_snapshot(inputs)

# ── Net Worth ────────────────────────────────────────────
class NetWorthRequest(BaseModel):
    month: str
    currency: str
    assets_items: list
    debts_items: list
    income_items: list
    expense_items: list
    emergency_fund: float
    note: Optional[str] = ""

@app.post("/api/networth/calculate")
def calculate_networth(req: NetWorthRequest):
    return build_payload(
        month=req.month,
        currency=req.currency,
        assets_items=req.assets_items,
        debts_items=req.debts_items,
        income_items=req.income_items,
        expense_items=req.expense_items,
        emergency_fund=req.emergency_fund,
        note=req.note,
    )

# ── Health check ─────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "message": "When do I Retired API is running"}