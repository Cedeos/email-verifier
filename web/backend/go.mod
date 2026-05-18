module github.com/AfterShip/email-verifier/web/backend

go 1.22

require (
	github.com/AfterShip/email-verifier v1.4.1
	github.com/golang-jwt/jwt/v5 v5.2.1
)

require (
	github.com/hbollon/go-edlib v1.6.0 // indirect
	golang.org/x/net v0.29.0 // indirect
	golang.org/x/text v0.18.0 // indirect
)

replace github.com/AfterShip/email-verifier => ../..
