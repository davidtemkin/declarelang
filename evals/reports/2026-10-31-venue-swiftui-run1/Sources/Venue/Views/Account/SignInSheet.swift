import SwiftUI

/// Sign in with an email address and a password. Optional at every step; dismissing it,
/// or signing in, leaves everything chosen and typed where it was.
struct SignInSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onSignedIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var showsPassword = false
    @State private var error: String?
    @State private var isWorking = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Sign in")
                    .font(Theme.display(28, weight: .medium))
                    .accessibilityAddTraits(.isHeader)
                Text("Use your saved cards and address. Your seats and anything you’ve typed stay as they are.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 14) {
                LabeledField("Email") {
                    TextField("Email", text: $email, prompt: Text("you@example.com"))
                        .textContentType(.username)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                }

                LabeledField("Password") {
                    HStack(spacing: 6) {
                        Group {
                            if showsPassword {
                                TextField("Password", text: $password)
                            } else {
                                SecureField("Password", text: $password)
                            }
                        }
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .onSubmit(submit)

                        Button {
                            showsPassword.toggle()
                            focus = .password
                        } label: {
                            Image(systemName: showsPassword ? "eye.slash" : "eye")
                                .frame(width: 22, height: 22)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(showsPassword ? "Hide password" : "Show password")
                        .help(showsPassword ? "Hide password" : "Show password")
                    }
                }

                if let error {
                    FieldMessage(error)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            HStack {
                Button("Cancel", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button(action: submit) {
                    HStack(spacing: 8) {
                        if isWorking { ProgressView().controlSize(.small) }
                        Text("Sign in")
                    }
                    .frame(minWidth: 80)
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isWorking || email.trimmed.isEmpty || password.isEmpty)
            }
        }
        .padding(28)
        .frame(width: 400)
        .textFieldStyle(.roundedBorder)
        .controlSize(.large)
        .onAppear { focus = .email }
        .animation(.snappy, value: error)
    }

    private func submit() {
        guard !isWorking, !email.trimmed.isEmpty, !password.isEmpty else { return }
        isWorking = true
        error = nil
        Task {
            defer { isWorking = false }
            do {
                try await app.account.signIn(email: email.trimmed, password: password)
                onSignedIn()
                AccessibilityNotification.Announcement("Signed in as \(app.account.account?.name ?? email)").post()
                dismiss()
            } catch {
                let message = error.localizedDescription
                self.error = message
                AccessibilityNotification.Announcement(message).post()
                focus = .password
            }
        }
    }
}

/// The toolbar's account control: sign in, or who you are and sign out.
struct AccountButton: View {
    @Environment(AppModel.self) private var app
    let showSignIn: () -> Void

    var body: some View {
        if let account = app.account.account {
            Menu {
                Text(account.email)
                Divider()
                Button("Sign out") { Task { await app.signOut() } }
            } label: {
                Label(account.name, systemImage: "person.crop.circle.fill")
                    .labelStyle(.titleAndIcon)
            }
            .accessibilityLabel("Account, \(account.name)")
            .disabled(app.checkout.isPaying)
        } else if !app.account.isRestoring {
            Button("Sign in", systemImage: "person.crop.circle", action: showSignIn)
                .labelStyle(.titleAndIcon)
                .disabled(app.checkout.isPaying)
        }
    }
}
