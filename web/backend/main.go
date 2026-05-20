package main

import (
	"bytes"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	emailVerifier "github.com/AfterShip/email-verifier"
)

// Config holds application configuration
type Config struct {
	Port               string
	AllowedDomains     []string
	SupabaseURL        string
	SupabaseJWTSecret  string
	SupabaseServiceKey string
	SupabaseAnonKey    string
	AdminEmail         string
	SMTPEnabled        bool
	GravatarEnabled    bool
	SOCKS5Proxy        string
}

// VerificationResult extends the library result with extra fields for the UI
type VerificationResult struct {
	Email        string `json:"email"`
	Status       string `json:"status"`
	SubStatus    string `json:"sub_status"`
	FreeEmail    bool   `json:"free_email"`
	Disposable   bool   `json:"disposable"`
	RoleAccount  bool   `json:"role_account"`
	Domain       string `json:"domain"`
	Username     string `json:"username"`
	MXFound      bool   `json:"mx_found"`
	MXRecord     string `json:"mx_record"`
	SMTPProvider string `json:"smtp_provider"`
	Suggestion   string `json:"suggestion"`
	HasGravatar  bool   `json:"has_gravatar"`
	GravatarURL  string `json:"gravatar_url"`
	Reachable    string `json:"reachable"`
	CatchAll     bool   `json:"catch_all"`
	Deliverable  bool   `json:"deliverable"`
	FullInbox    bool   `json:"full_inbox"`
	HostExists   bool   `json:"host_exists"`
	Disabled     bool   `json:"disabled"`
	VerifiedAt   string `json:"verified_at"`
}

// BulkResult holds results for bulk verification
type BulkResult struct {
	ID          string               `json:"id"`
	Status      string               `json:"status"`
	Total       int                  `json:"total"`
	Processed   int                  `json:"processed"`
	Results     []VerificationResult `json:"results,omitempty"`
	Summary     *BulkSummary         `json:"summary,omitempty"`
	StartedAt   time.Time            `json:"started_at"`
	CompletedAt *time.Time           `json:"completed_at,omitempty"`
}

// BulkSummary provides stats for bulk verification
type BulkSummary struct {
	Total       int `json:"total"`
	Valid       int `json:"valid"`
	Invalid     int `json:"invalid"`
	Unknown     int `json:"unknown"`
	Risky       int `json:"risky"`
	CatchAll    int `json:"catch_all"`
	Disposable  int `json:"disposable"`
	RoleAccount int `json:"role_account"`
	Free        int `json:"free"`
}

// ActivityLog represents an activity log entry
type ActivityLog struct {
	ID        string `json:"id"`
	UserEmail string `json:"user_email"`
	Action    string `json:"action"`
	Details   string `json:"details"`
	Result    string `json:"result"`
	CreatedAt string `json:"created_at"`
}

var (
	config         Config
	verifier       *emailVerifier.Verifier
	verifierNoCA   *emailVerifier.Verifier // verifier with catch-all check disabled
	bulkJobs       = make(map[string]*BulkResult)
	bulkMu         sync.RWMutex
	jobCounter     int
	actLogs        []ActivityLog
	logMu          sync.RWMutex
	logCounter     int
)

func main() {
	config = Config{
		Port:               getEnv("PORT", "8080"),
		SupabaseURL:        getEnv("SUPABASE_URL", ""),
		SupabaseJWTSecret:  getEnv("SUPABASE_JWT_SECRET", ""),
		SupabaseServiceKey: getEnv("SUPABASE_SERVICE_ROLE_KEY", ""),
		SupabaseAnonKey:    getEnv("SUPABASE_ANON_KEY", ""),
		AdminEmail:         getEnv("ADMIN_EMAIL", "alvin@cedeos.co.ke"),
		SMTPEnabled:        getEnv("SMTP_ENABLED", "true") == "true",
		GravatarEnabled:    getEnv("GRAVATAR_ENABLED", "true") == "true",
		SOCKS5Proxy:        getEnv("SOCKS5_PROXY", ""),
	}

	// Parse allowed domains
	allowedDomainsStr := getEnv("ALLOWED_DOMAINS", "")
	if allowedDomainsStr != "" {
		config.AllowedDomains = strings.Split(allowedDomainsStr, ",")
		for i := range config.AllowedDomains {
			config.AllowedDomains[i] = strings.TrimSpace(config.AllowedDomains[i])
		}
	}

	verifier = emailVerifier.NewVerifier().
		EnableDomainSuggest().
		EnableAutoUpdateDisposable().
		HelloName("smtp-proxy.cedeos.co.ke").
		FromEmail("verify@probe.cedeos.co.ke")

	if config.SMTPEnabled {
		verifier.EnableSMTPCheck()
	}
	if config.SOCKS5Proxy != "" {
		verifier.Proxy(config.SOCKS5Proxy)
	}
	if config.GravatarEnabled {
		verifier.EnableGravatarCheck()
	}

	// Second verifier with catch-all detection disabled - used for the actual
	// mailbox probe in our two-step verification (real email + fake email comparison)
	verifierNoCA = emailVerifier.NewVerifier().
		EnableSMTPCheck().
		DisableCatchAllCheck().
		HelloName("smtp-proxy.cedeos.co.ke").
		FromEmail("verify@probe.cedeos.co.ke")
	if config.SOCKS5Proxy != "" {
		verifierNoCA.Proxy(config.SOCKS5Proxy)
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/auth/log", authMiddleware(handleAuthLog))
	mux.HandleFunc("/api/verify/single", authMiddleware(handleSingleVerify))
	mux.HandleFunc("/api/verify/bulk", authMiddleware(handleBulkVerify))
	mux.HandleFunc("/api/verify/bulk/status/", authMiddleware(handleBulkStatus))
	mux.HandleFunc("/api/verify/bulk/download/", authMiddleware(handleBulkDownload))

	// Admin routes
	mux.HandleFunc("/api/admin/users", authMiddleware(adminMiddleware(handleAdminUsers)))
	mux.HandleFunc("/api/admin/invite", authMiddleware(adminMiddleware(handleAdminInvite)))
	mux.HandleFunc("/api/admin/logs", authMiddleware(adminMiddleware(handleAdminLogs)))

	// Serve frontend static files
	fs := http.FileServer(http.Dir("./frontend/dist"))
	mux.Handle("/assets/", fs)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "./frontend/dist/index.html")
	})

	handler := corsMiddleware(mux)

	server := &http.Server{
		Addr:         ":" + config.Port,
		Handler:      handler,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Email Verifier API starting on port %s", config.Port)
	log.Printf("  Admin: %s", config.AdminEmail)
	log.Printf("  SMTP check: %v", config.SMTPEnabled)
	log.Printf("  Gravatar check: %v", config.GravatarEnabled)
	if config.SOCKS5Proxy != "" {
		log.Printf("  SOCKS5 proxy: configured")
	}
	log.Fatal(server.ListenAndServe())
}

// --- Middleware ---

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenStr := r.Header.Get("Authorization")
		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}
		tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")

		if tokenStr == "" {
			jsonError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Try local JWT verification first if secret is configured
		email := ""
		if config.SupabaseJWTSecret != "" {
			claims := jwt.MapClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(config.SupabaseJWTSecret), nil
			})

			if err != nil || !token.Valid {
				jsonError(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			exp, ok := claims["exp"].(float64)
			if !ok || time.Now().Unix() > int64(exp) {
				jsonError(w, "Token expired", http.StatusUnauthorized)
				return
			}

			if e, ok := claims["email"].(string); ok {
				email = e
			}
		} else {
			// Fallback: verify token via Supabase API
			req, _ := http.NewRequest("GET", config.SupabaseURL+"/auth/v1/user", nil)
			req.Header.Set("Authorization", "Bearer "+tokenStr)
			req.Header.Set("apikey", config.SupabaseAnonKey)

			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode != 200 {
				jsonError(w, "Invalid token", http.StatusUnauthorized)
				return
			}
			defer resp.Body.Close()

			var user struct {
				Email string `json:"email"`
			}
			json.NewDecoder(resp.Body).Decode(&user)
			email = user.Email
		}

		// Check cedeos domain
		if email != "" {
			parts := strings.Split(email, "@")
			if len(parts) == 2 {
				domain := strings.ToLower(parts[1])
				if !strings.HasPrefix(domain, "cedeos.") && domain != "cedeos" {
					jsonError(w, "Access denied: domain not allowed", http.StatusForbidden)
					return
				}
			}
		}

		r.Header.Set("X-User-Email", email)
		next(w, r)
	}
}

func adminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := r.Header.Get("X-User-Email")
		if !strings.EqualFold(email, config.AdminEmail) {
			jsonError(w, "Admin access required", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

// --- Handlers ---

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]string{"status": "ok", "service": "email-verifier"})
}

func handleAuthLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email := r.Header.Get("X-User-Email")
	addLog(email, "login", "User signed in", "success")
	jsonResponse(w, map[string]string{"status": "ok"})
}

func handleSingleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		jsonError(w, "Email is required", http.StatusBadRequest)
		return
	}

	userEmail := r.Header.Get("X-User-Email")
	result := verifyEmail(req.Email)

	// Log activity
	addLog(userEmail, "single_verify", req.Email, result.Status)

	jsonResponse(w, result)
}

func handleBulkVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	var emails []string

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if len(record) > 0 {
			email := strings.TrimSpace(record[0])
			if email != "" && email != "email" && strings.Contains(email, "@") {
				emails = append(emails, email)
			}
		}
	}

	if len(emails) == 0 {
		jsonError(w, "No valid emails found in file", http.StatusBadRequest)
		return
	}

	userEmail := r.Header.Get("X-User-Email")

	bulkMu.Lock()
	jobCounter++
	jobID := fmt.Sprintf("bulk_%d_%d", time.Now().Unix(), jobCounter)
	job := &BulkResult{
		ID:        jobID,
		Status:    "processing",
		Total:     len(emails),
		Processed: 0,
		Results:   make([]VerificationResult, 0, len(emails)),
		StartedAt: time.Now(),
	}
	bulkJobs[jobID] = job
	bulkMu.Unlock()

	// Log activity
	addLog(userEmail, "bulk_verify", fmt.Sprintf("%d emails uploaded", len(emails)), "processing")

	go processBulkVerification(jobID, emails, userEmail)

	jsonResponse(w, map[string]interface{}{
		"id":     jobID,
		"status": "processing",
		"total":  len(emails),
	})
}

func handleBulkStatus(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimPrefix(r.URL.Path, "/api/verify/bulk/status/")

	bulkMu.RLock()
	job, exists := bulkJobs[jobID]
	bulkMu.RUnlock()

	if !exists {
		jsonError(w, "Job not found", http.StatusNotFound)
		return
	}

	jsonResponse(w, job)
}

func handleBulkDownload(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimPrefix(r.URL.Path, "/api/verify/bulk/download/")

	bulkMu.RLock()
	job, exists := bulkJobs[jobID]
	bulkMu.RUnlock()

	if !exists || job.Status != "completed" {
		jsonError(w, "Job not found or not completed", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=verification_%s.csv", jobID))

	writer := csv.NewWriter(w)
	writer.Write([]string{
		"Email", "Status", "Sub-Status", "Free Email", "Disposable",
		"Role Account", "Domain", "MX Found", "MX Record", "SMTP Provider",
		"Suggestion", "Catch-All", "Deliverable", "Reachable",
	})

	for _, result := range job.Results {
		writer.Write([]string{
			result.Email,
			result.Status,
			result.SubStatus,
			fmt.Sprintf("%v", result.FreeEmail),
			fmt.Sprintf("%v", result.Disposable),
			fmt.Sprintf("%v", result.RoleAccount),
			result.Domain,
			fmt.Sprintf("%v", result.MXFound),
			result.MXRecord,
			result.SMTPProvider,
			result.Suggestion,
			fmt.Sprintf("%v", result.CatchAll),
			fmt.Sprintf("%v", result.Deliverable),
			result.Reachable,
		})
	}
	writer.Flush()
}

// --- Admin Handlers ---

func handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if config.SupabaseServiceKey == "" {
		jsonError(w, "Service key not configured", http.StatusInternalServerError)
		return
	}

	// List users via Supabase Admin API
	req, _ := http.NewRequest("GET", config.SupabaseURL+"/auth/v1/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+config.SupabaseServiceKey)
	req.Header.Set("apikey", config.SupabaseServiceKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		jsonError(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var result struct {
		Users []struct {
			ID           string  `json:"id"`
			Email        string  `json:"email"`
			CreatedAt    string  `json:"created_at"`
			LastSignInAt *string `json:"last_sign_in_at"`
			Factors      []struct {
				Status string `json:"status"`
			} `json:"factors"`
		} `json:"users"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		jsonError(w, "Failed to parse users", http.StatusInternalServerError)
		return
	}

	type UserResponse struct {
		ID           string `json:"id"`
		Email        string `json:"email"`
		CreatedAt    string `json:"created_at"`
		LastSignInAt string `json:"last_sign_in_at"`
		MFAEnabled   bool   `json:"mfa_enabled"`
	}

	users := make([]UserResponse, 0, len(result.Users))
	for _, u := range result.Users {
		mfa := false
		for _, f := range u.Factors {
			if f.Status == "verified" {
				mfa = true
				break
			}
		}
		lastSign := ""
		if u.LastSignInAt != nil {
			lastSign = *u.LastSignInAt
		}
		users = append(users, UserResponse{
			ID:           u.ID,
			Email:        u.Email,
			CreatedAt:    u.CreatedAt,
			LastSignInAt: lastSign,
			MFAEnabled:   mfa,
		})
	}

	jsonResponse(w, map[string]interface{}{"users": users})
}

func handleAdminInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if config.SupabaseServiceKey == "" {
		jsonError(w, "Service key not configured", http.StatusInternalServerError)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		jsonError(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		jsonError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	// Validate cedeos domain
	parts := strings.Split(req.Email, "@")
	if len(parts) != 2 || !strings.HasPrefix(strings.ToLower(parts[1]), "cedeos.") {
		jsonError(w, "Only cedeos.* email domains are allowed", http.StatusBadRequest)
		return
	}

	// Create user via Supabase Admin API with password
	body, _ := json.Marshal(map[string]interface{}{
		"email":             req.Email,
		"password":          req.Password,
		"email_confirm":     true,
	})

	httpReq, _ := http.NewRequest("POST", config.SupabaseURL+"/auth/v1/admin/users", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+config.SupabaseServiceKey)
	httpReq.Header.Set("apikey", config.SupabaseServiceKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		jsonError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errResp)
		msg := "Failed to create user"
		if m, ok := errResp["msg"].(string); ok {
			msg = m
		}
		if m, ok := errResp["message"].(string); ok {
			msg = m
		}
		jsonError(w, msg, resp.StatusCode)
		return
	}

	adminEmail := r.Header.Get("X-User-Email")
	addLog(adminEmail, "invite_user", req.Email, "created")

	jsonResponse(w, map[string]string{"status": "created", "email": req.Email})
}

func handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	actionFilter := r.URL.Query().Get("action")

	logMu.RLock()
	defer logMu.RUnlock()

	filtered := make([]ActivityLog, 0)
	for i := len(actLogs) - 1; i >= 0; i-- {
		if actionFilter != "" && actionFilter != "all" && actLogs[i].Action != actionFilter {
			continue
		}
		filtered = append(filtered, actLogs[i])
		if len(filtered) >= 200 {
			break
		}
	}

	jsonResponse(w, map[string]interface{}{"logs": filtered})
}

// --- Business Logic ---

func verifyEmail(email string) VerificationResult {
	result, err := verifier.Verify(email)

	vr := VerificationResult{
		Email:      email,
		VerifiedAt: time.Now().Format(time.RFC3339),
	}

	if err != nil {
		vr.Status = "unknown"
		vr.SubStatus = err.Error()
	}

	if result == nil {
		vr.Status = "invalid"
		vr.SubStatus = "verification_failed"
		return vr
	}

	vr.Username = result.Syntax.Username
	vr.Domain = result.Syntax.Domain
	vr.FreeEmail = result.Free
	vr.Disposable = result.Disposable
	vr.RoleAccount = result.RoleAccount
	vr.MXFound = result.HasMxRecords
	vr.Suggestion = result.Suggestion
	vr.Reachable = result.Reachable

	// Hard fails - definitely invalid
	if !result.Syntax.Valid {
		vr.Status = "invalid"
		vr.SubStatus = "bad_syntax"
		return vr
	}

	if result.Disposable {
		vr.Status = "invalid"
		vr.SubStatus = "disposable_email"
		return vr
	}

	if !result.HasMxRecords {
		vr.Status = "invalid"
		vr.SubStatus = "no_mx_records"
		return vr
	}

	// MX provider info
	mx, _ := verifier.CheckMX(result.Syntax.Domain)
	if mx != nil && len(mx.Records) > 0 {
		vr.MXRecord = mx.Records[0].Host
		vr.SMTPProvider = detectSMTPProvider(mx.Records[0].Host)
	}

	// SMTP-based verdict
	if result.SMTP == nil {
		// SMTP check disabled or couldn't be performed
		vr.Status = "unknown"
		vr.SubStatus = "smtp_check_unavailable"
		vr.Reachable = "unknown"
		return vr
	}

	vr.HostExists = result.SMTP.HostExists
	vr.CatchAll = result.SMTP.CatchAll
	vr.Deliverable = result.SMTP.Deliverable
	vr.FullInbox = result.SMTP.FullInbox
	vr.Disabled = result.SMTP.Disabled

	// SMART CATCH-ALL DETECTION (Fake Email Interleaving)
	// The library reports catch-all=true if the random RCPT probe gets accepted.
	// However, providers like Google sometimes return 250 OK for ALL probes when
	// they detect automated scanning. We need to distinguish between:
	//   1. Genuine catch-all domain (every email accepted forever)
	//   2. Fake catch-all (provider is gaslighting us)
	//   3. Normal domain where the actual user check needs to happen separately
	//
	// Strategy: probe both a fake address AND the real address with catch-all
	// detection disabled. Compare the responses:
	//   - Fake REJECTED, real ACCEPTED  -> mailbox exists (valid)
	//   - Fake REJECTED, real REJECTED  -> mailbox doesn't exist (invalid)
	//   - Fake ACCEPTED, real ACCEPTED  -> genuine catch-all OR provider gaslighting
	//   - Fake ACCEPTED, real REJECTED  -> shouldn't happen, treat as invalid
	if result.SMTP.HostExists {
		// Probe the actual mailbox without catch-all check (gets us the real answer)
		realResult, _ := verifierNoCA.CheckSMTP(result.Syntax.Domain, result.Syntax.Username)

		// Probe a fake mailbox to see if domain accepts everything
		fakeUser := generateFakeUsername()
		fakeResult, _ := verifierNoCA.CheckSMTP(result.Syntax.Domain, fakeUser)

		realAccepted := realResult != nil && realResult.Deliverable
		fakeAccepted := fakeResult != nil && fakeResult.Deliverable

		switch {
		case realAccepted && !fakeAccepted:
			// Real mailbox accepted, fake rejected = mailbox confirmed to exist
			vr.Deliverable = true
			vr.CatchAll = false
			vr.HostExists = true
		case !realAccepted && !fakeAccepted:
			// Both rejected = mailbox doesn't exist
			vr.Deliverable = false
			vr.CatchAll = false
			vr.HostExists = realResult != nil && realResult.HostExists
			if realResult != nil {
				vr.FullInbox = realResult.FullInbox
				vr.Disabled = realResult.Disabled
			}
		case realAccepted && fakeAccepted:
			// Both accepted = either genuine catch-all or provider gaslighting
			// Mark as catch-all (risky) - we can't confirm the specific mailbox
			vr.Deliverable = false
			vr.CatchAll = true
		default:
			// Edge case: real rejected, fake accepted - treat as invalid
			vr.Deliverable = false
			vr.CatchAll = false
		}
	}

	// Honest status mapping based on actual SMTP results
	switch {
	case vr.Disabled:
		vr.Status = "invalid"
		vr.SubStatus = "mailbox_disabled"
		vr.Reachable = "no"
	case vr.FullInbox:
		vr.Status = "risky"
		vr.SubStatus = "full_inbox"
		vr.Reachable = "unknown"
	case !vr.HostExists:
		// Couldn't connect to SMTP server (port 25 blocked, etc.)
		vr.Status = "unknown"
		vr.SubStatus = "smtp_unreachable"
		vr.Reachable = "unknown"
	case vr.Deliverable:
		// SMTP server confirmed mailbox exists - this is the only true "valid"
		vr.Status = "valid"
		vr.SubStatus = "mailbox_exists"
		vr.Reachable = "yes"
	case vr.CatchAll:
		// Domain accepts all emails (genuine or provider gaslighting)
		vr.Status = "risky"
		vr.SubStatus = "catch_all_domain"
		vr.Reachable = "unknown"
	default:
		// SMTP rejected the RCPT TO - mailbox likely doesn't exist
		vr.Status = "invalid"
		vr.SubStatus = "mailbox_not_found"
		vr.Reachable = "no"
	}

	if result.Gravatar != nil {
		vr.HasGravatar = result.Gravatar.HasGravatar
		vr.GravatarURL = result.Gravatar.GravatarUrl
	}

	return vr
}

func detectSMTPProvider(mxHost string) string {
	mxLower := strings.ToLower(mxHost)
	switch {
	case strings.Contains(mxLower, "google") || strings.Contains(mxLower, "gmail"):
		return "google"
	case strings.Contains(mxLower, "outlook") || strings.Contains(mxLower, "microsoft"):
		return "microsoft"
	case strings.Contains(mxLower, "yahoo"):
		return "yahoo"
	case strings.Contains(mxLower, "zoho"):
		return "zoho"
	case strings.Contains(mxLower, "protonmail") || strings.Contains(mxLower, "proton"):
		return "protonmail"
	case strings.Contains(mxLower, "icloud") || strings.Contains(mxLower, "apple"):
		return "apple"
	case strings.Contains(mxLower, "yandex"):
		return "yandex"
	case strings.Contains(mxLower, "fastmail"):
		return "fastmail"
	case strings.Contains(mxLower, "mimecast"):
		return "mimecast"
	case strings.Contains(mxLower, "pphosted") || strings.Contains(mxLower, "proofpoint"):
		return "proofpoint"
	default:
		return "other"
	}
}

func processBulkVerification(jobID string, emails []string, userEmail string) {
	sem := make(chan struct{}, 5)
	var wg sync.WaitGroup

	results := make([]VerificationResult, len(emails))

	for i, email := range emails {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, e string) {
			defer wg.Done()
			defer func() { <-sem }()

			results[idx] = verifyEmail(e)

			bulkMu.Lock()
			bulkJobs[jobID].Processed++
			bulkMu.Unlock()
		}(i, email)
	}

	wg.Wait()

	summary := &BulkSummary{Total: len(results)}
	for _, r := range results {
		switch r.Status {
		case "valid":
			summary.Valid++
		case "invalid":
			summary.Invalid++
		case "risky", "catch-all":
			summary.Risky++
			if r.CatchAll {
				summary.CatchAll++
			}
		default:
			summary.Unknown++
		}
		if r.Disposable {
			summary.Disposable++
		}
		if r.RoleAccount {
			summary.RoleAccount++
		}
		if r.FreeEmail {
			summary.Free++
		}
	}

	now := time.Now()
	bulkMu.Lock()
	bulkJobs[jobID].Status = "completed"
	bulkJobs[jobID].Results = results
	bulkJobs[jobID].Summary = summary
	bulkJobs[jobID].CompletedAt = &now
	bulkMu.Unlock()

	// Update log with results
	addLog(userEmail, "bulk_complete", fmt.Sprintf("Job %s: %d valid, %d invalid, %d catch-all", jobID, summary.Valid, summary.Invalid, summary.CatchAll), "completed")
}

// --- Logging ---

var eat = time.FixedZone("EAT", 3*60*60) // UTC+3 East Africa Time

func addLog(userEmail, action, details, result string) {
	logMu.Lock()
	defer logMu.Unlock()

	logCounter++
	actLogs = append(actLogs, ActivityLog{
		ID:        fmt.Sprintf("log_%d", logCounter),
		UserEmail: userEmail,
		Action:    action,
		Details:   details,
		Result:    result,
		CreatedAt: time.Now().In(eat).Format("2006-01-02 15:04:05 EAT"),
	})

	// Keep max 1000 logs in memory
	if len(actLogs) > 1000 {
		actLogs = actLogs[len(actLogs)-1000:]
	}
}

// --- Helpers ---

// generateFakeUsername creates a random username unlikely to exist.
// Used to interleave a fake probe alongside the real mailbox check
// to detect provider gaslighting (sending fake 250 OK to all probes).
func generateFakeUsername() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return "verify-test-" + hex.EncodeToString(bytes)
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(value)
	}
	return fallback
}
