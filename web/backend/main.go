package main

import (
	"encoding/csv"
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
	Port             string
	AllowedDomains   []string // restrict login to these email domains
	SupabaseURL      string
	SupabaseJWTSecret string
	SMTPEnabled      bool
	GravatarEnabled  bool
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
	CatchAll    int `json:"catch_all"`
	Disposable  int `json:"disposable"`
	RoleAccount int `json:"role_account"`
	Free        int `json:"free"`
}

var (
	config     Config
	verifier   *emailVerifier.Verifier
	bulkJobs   = make(map[string]*BulkResult)
	bulkMu     sync.RWMutex
	jobCounter int
)

func main() {
	config = Config{
		Port:             getEnv("PORT", "8080"),
		SupabaseURL:      getEnv("SUPABASE_URL", "https://mqdlwzwlzreampufqxzg.supabase.co"),
		SupabaseJWTSecret: getEnv("SUPABASE_JWT_SECRET", ""),
		SMTPEnabled:      getEnv("SMTP_ENABLED", "true") == "true",
		GravatarEnabled:  getEnv("GRAVATAR_ENABLED", "true") == "true",
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
		EnableAutoUpdateDisposable()

	if config.SMTPEnabled {
		verifier.EnableSMTPCheck()
	}
	if config.GravatarEnabled {
		verifier.EnableGravatarCheck()
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/verify/single", authMiddleware(handleSingleVerify))
	mux.HandleFunc("/api/verify/bulk", authMiddleware(handleBulkVerify))
	mux.HandleFunc("/api/verify/bulk/status/", authMiddleware(handleBulkStatus))
	mux.HandleFunc("/api/verify/bulk/download/", authMiddleware(handleBulkDownload))

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
	log.Printf("  Allowed domains: %v", config.AllowedDomains)
	log.Printf("  SMTP check: %v", config.SMTPEnabled)
	log.Printf("  Gravatar check: %v", config.GravatarEnabled)
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

		// Verify Supabase JWT
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

		// Check expiration
		exp, ok := claims["exp"].(float64)
		if !ok || time.Now().Unix() > int64(exp) {
			jsonError(w, "Token expired", http.StatusUnauthorized)
			return
		}

		// Extract email from claims
		email := ""
		if userMeta, ok := claims["email"].(string); ok {
			email = userMeta
		}

		// Check allowed domains
		if len(config.AllowedDomains) > 0 && email != "" {
			parts := strings.Split(email, "@")
			if len(parts) == 2 {
				domain := parts[1]
				allowed := false
				for _, d := range config.AllowedDomains {
					if strings.EqualFold(domain, d) {
						allowed = true
						break
					}
				}
				if !allowed {
					jsonError(w, "Access denied: domain not allowed", http.StatusForbidden)
					return
				}
			}
		}

		r.Header.Set("X-User-Email", email)
		next(w, r)
	}
}

// --- Handlers ---

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, map[string]string{"status": "ok", "service": "email-verifier"})
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

	result := verifyEmail(req.Email)
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

	go processBulkVerification(jobID, emails)

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

	if !result.Syntax.Valid {
		vr.Status = "invalid"
		vr.SubStatus = "bad_syntax"
		return vr
	}

	if result.Disposable {
		vr.Status = "invalid"
		vr.SubStatus = "disposable"
		return vr
	}

	if !result.HasMxRecords {
		vr.Status = "invalid"
		vr.SubStatus = "no_mx_records"
		return vr
	}

	if result.SMTP != nil {
		vr.HostExists = result.SMTP.HostExists
		vr.CatchAll = result.SMTP.CatchAll
		vr.Deliverable = result.SMTP.Deliverable
		vr.FullInbox = result.SMTP.FullInbox
		vr.Disabled = result.SMTP.Disabled

		if result.SMTP.Disabled {
			vr.Status = "invalid"
			vr.SubStatus = "mailbox_disabled"
		} else if result.SMTP.FullInbox {
			vr.Status = "invalid"
			vr.SubStatus = "full_inbox"
		} else if result.SMTP.CatchAll {
			vr.Status = "catch-all"
			vr.SubStatus = "catch_all"
		} else if result.SMTP.Deliverable {
			vr.Status = "valid"
			vr.SubStatus = "none"
		} else if !result.SMTP.HostExists {
			vr.Status = "invalid"
			vr.SubStatus = "host_not_found"
		} else {
			vr.Status = "unknown"
			vr.SubStatus = "smtp_check_inconclusive"
		}
	} else {
		if result.HasMxRecords {
			vr.Status = "valid"
			vr.SubStatus = "none"
		} else {
			vr.Status = "unknown"
			vr.SubStatus = "no_smtp_check"
		}
	}

	if result.Gravatar != nil {
		vr.HasGravatar = result.Gravatar.HasGravatar
		vr.GravatarURL = result.Gravatar.GravatarUrl
	}

	mx, _ := verifier.CheckMX(result.Syntax.Domain)
	if mx != nil && len(mx.Records) > 0 {
		vr.MXRecord = mx.Records[0].Host
		vr.SMTPProvider = detectSMTPProvider(mx.Records[0].Host)
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

func processBulkVerification(jobID string, emails []string) {
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
		case "catch-all":
			summary.CatchAll++
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
}

// --- Helpers ---

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
		return value
	}
	return fallback
}
