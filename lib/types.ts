export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "ended"
  | "sold_out";

export type CampaignRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: CampaignStatus;
  starts_at: string;
  ends_at: string;
  default_spins: number;
  created_at: string;
  updated_at: string;
};

export type PrizeRecord = {
  id: string;
  campaign_id: string;
  name: string;
  color: string;
  image_url: string | null;
  quantity: number;
  remaining: number;
  probability: number;
  position: number;
};

export type AccessCodeRecord = {
  id: string;
  campaign_id: string;
  code_hash: string;
  code_hint: string;
  participant_name: string | null;
  contact: string | null;
  spins_limit: number;
  spins_used: number;
  status: "active" | "blocked" | "revoked";
  created_at: string;
};

export type SpinRecord = {
  id: string;
  campaign_id: string;
  access_code_id: string;
  prize_id: string;
  request_id: string;
  prize_name: string;
  fulfillment_status: "pending" | "fulfilled";
  fulfilled_at: string | null;
  fulfillment_note: string | null;
  created_at: string;
};
