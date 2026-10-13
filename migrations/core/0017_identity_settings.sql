-- Preserve Willow owners' previously approved optional identity setting.
INSERT INTO oa_auth_settings(singleton,idp_sign_in,generation,first_setup)
SELECT 1,oidc,0,0 FROM wl_connections WHERE singleton=1
ON CONFLICT(singleton) DO NOTHING;
