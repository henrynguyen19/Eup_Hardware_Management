-- Thêm cột zone (Cust_SaleManAssistant_Zone từ CRM) vào ho_tro_tickets
ALTER TABLE ho_tro_tickets ADD COLUMN IF NOT EXISTS zone TEXT;

COMMENT ON COLUMN ho_tro_tickets.zone IS 'Vùng/văn phòng từ CRM field Cust_SaleManAssistant_Zone';
